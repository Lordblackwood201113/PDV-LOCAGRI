import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { writeAuditLog } from "./audit";

// ============================================
// DONS — sorties de stock sans encaissement
// ============================================
// Un don décrémente le stock comme une vente mais N'ENCAISSE RIEN : il n'écrit
// aucune ligne `sales` et ne touche ni la caisse ni le chiffre d'affaires.
// Traçabilité : 1 en-tête `donations` (l'événement) + N `stockMovements`
// `type:"donation"` (un par produit, reliés via donationId/donationReference).

/**
 * Enregistrer un don multi-produits (panier). Accessible à TOUS les rôles
 * authentifiés actifs (pas de blocage caissier, pas de session de caisse requise).
 */
export const recordDonation = mutation({
  args: {
    donorName: v.string(),
    motif: v.optional(v.string()),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("Utilisateur non trouvé");
    }
    if (!user.isActive) {
      throw new Error("Compte utilisateur désactivé");
    }

    // Validations de base
    const donorName = args.donorName.trim();
    if (!donorName) {
      throw new Error("La personne qui effectue le don est requise");
    }
    if (args.items.length === 0) {
      throw new Error("Ajoutez au moins un produit au don");
    }

    // Agréger les quantités par produit (un même produit peut apparaître plusieurs fois)
    const aggregated = new Map<Id<"products">, number>();
    for (const item of args.items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new Error("Chaque quantité doit être un entier supérieur à 0");
      }
      aggregated.set(
        item.productId,
        (aggregated.get(item.productId) ?? 0) + item.quantity
      );
    }

    const now = Date.now();

    // Valider et construire les lignes (avant toute écriture)
    const lines: {
      productId: Id<"products">;
      productName: string;
      productReference?: string;
      quantity: number;
      unitValue: number;
      lineValue: number;
      previousStock: number;
      newStock: number;
    }[] = [];

    for (const [productId, quantity] of aggregated) {
      const product = await ctx.db.get(productId);
      if (!product) {
        throw new Error("Produit non trouvé");
      }
      // Données legacy : isActive peut être undefined (traité comme actif)
      if (product.isActive === false) {
        throw new Error(`Le produit "${product.name}" n'est plus disponible`);
      }
      const productUnit = product.unit ?? "sac";
      if (product.stockQuantity < quantity) {
        throw new Error(
          `Stock insuffisant pour ${product.name} : disponible ${product.stockQuantity} ${productUnit}(s), demandé ${quantity}`
        );
      }

      const unitValue = product.price;
      lines.push({
        productId,
        productName: product.name,
        productReference: product.reference,
        quantity,
        unitValue,
        lineValue: unitValue * quantity,
        previousStock: product.stockQuantity,
        newStock: product.stockQuantity - quantity,
      });
    }

    const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
    const totalValue = lines.reduce((sum, l) => sum + l.lineValue, 0);
    const itemCount = lines.length;

    // Référence du don
    const donationReference: string = await ctx.runMutation(
      internal.references.getNextReference,
      { type: "donation" }
    );

    // En-tête du don
    const donationId = await ctx.db.insert("donations", {
      reference: donationReference,
      date: now,
      donorName,
      motif: args.motif?.trim() ? args.motif.trim() : undefined,
      items: lines,
      totalQuantity,
      totalValue,
      itemCount,
      userId: identity.subject,
      userName: user.name,
    });

    // Décrément de stock + mouvement par ligne
    const motifSuffix = args.motif?.trim() ? ` (${args.motif.trim()})` : "";
    const lowStockProducts: string[] = [];
    for (const line of lines) {
      await ctx.db.patch(line.productId, {
        stockQuantity: line.newStock,
        updatedAt: now,
      });

      const movementReference: string = await ctx.runMutation(
        internal.references.getNextReference,
        { type: "movement" }
      );
      await ctx.db.insert("stockMovements", {
        reference: movementReference,
        date: now,
        productId: line.productId,
        productName: line.productName,
        productReference: line.productReference,
        type: "donation",
        quantity: line.quantity,
        reason: `Don ${donationReference} — ${donorName}${motifSuffix}`,
        userId: identity.subject,
        userName: user.name,
        previousStock: line.previousStock,
        newStock: line.newStock,
        donationId,
        donationReference,
      });

      const product = await ctx.db.get(line.productId);
      if (product && line.newStock <= product.alertThreshold) {
        lowStockProducts.push(line.productName);
      }
    }

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "stock.donated",
      category: "stock",
      summary: `Don ${donationReference} : ${itemCount} article(s), ${totalQuantity} unité(s) (~${totalValue} FCFA) — par ${donorName}${motifSuffix}`,
      targetType: "donation",
      targetId: donationId,
      targetRef: donationReference,
      targetName: donorName,
      after: String(totalValue),
    });

    return {
      donationReference,
      totalQuantity,
      totalValue,
      itemCount,
      lowStockProducts,
    };
  },
});

/**
 * Liste des dons (manager/admin) avec total de la période. Le caissier peut
 * enregistrer un don mais ne consulte pas la liste (comme l'historique de stock).
 */
export const getDonations = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const empty = { donations: [], totalValue: 0, totalQuantity: 0, count: 0 };

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return empty;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Réservé manager/admin (mêmes garde-fous que getStockHistory)
    if (!user || user.role === "cashier") {
      return empty;
    }

    let donations = await ctx.db
      .query("donations")
      .withIndex("by_date")
      .order("desc")
      .collect();

    if (args.startDate !== undefined) {
      donations = donations.filter((d) => d.date >= args.startDate!);
    }
    if (args.endDate !== undefined) {
      donations = donations.filter((d) => d.date <= args.endDate!);
    }

    // Totaux sur la période (avant la limite d'affichage)
    const totalValue = donations.reduce((sum, d) => sum + d.totalValue, 0);
    const totalQuantity = donations.reduce((sum, d) => sum + d.totalQuantity, 0);
    const count = donations.length;

    if (args.limit) {
      donations = donations.slice(0, args.limit);
    }

    return { donations, totalValue, totalQuantity, count };
  },
});
