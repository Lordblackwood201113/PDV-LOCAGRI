import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { writeAuditLog } from "./audit";

// ============================================
// CONVERSIONS — déconditionnement (sac → sachets)
// ============================================
// Une conversion est une TRANSFORMATION INTERNE de stock : elle consomme N unités
// d'un produit source (sac) pour produire N×ratio unités d'un produit cible (sachet).
// Elle N'ENCAISSE RIEN : aucune ligne `sales`, ni caisse, ni chiffre d'affaires.
// Le revenu naît uniquement à la VENTE des sachets (flux de vente inchangé).
// Traçabilité : 1 en-tête `conversions` (l'événement) + 2 `stockMovements`
// `type:"conversion"` (jambe source + jambe cible, reliées via conversionId).

/**
 * Convertir N unités d'un produit source en N×ratio unités d'un produit cible.
 * Accessible à TOUS les rôles authentifiés actifs (caissier inclus) — opération de
 * comptoir « à la demande ». Aucune session de caisse requise (ne touche pas le tiroir).
 */
export const convertStock = mutation({
  args: {
    sourceProductId: v.id("products"),
    targetProductId: v.id("products"),
    sourceQuantity: v.number(),
    note: v.optional(v.string()),
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

    if (args.sourceProductId === args.targetProductId) {
      throw new Error("La source et la cible doivent être deux produits différents");
    }

    if (!Number.isInteger(args.sourceQuantity) || args.sourceQuantity <= 0) {
      throw new Error("Le nombre d'unités à convertir doit être un entier supérieur à 0");
    }

    const source = await ctx.db.get(args.sourceProductId);
    if (!source) {
      throw new Error("Produit source introuvable");
    }
    if (source.isActive === false) {
      throw new Error(`Le produit "${source.name}" n'est plus disponible`);
    }

    const target = await ctx.db.get(args.targetProductId);
    if (!target) {
      throw new Error("Produit cible introuvable");
    }
    if (target.isActive === false) {
      throw new Error(`Le produit "${target.name}" n'est plus disponible`);
    }

    // Garde-fou : la cible doit être réellement issue de la source
    if (target.parentProductId !== args.sourceProductId) {
      throw new Error(
        `"${target.name}" n'est pas issu de "${source.name}". Vérifiez le lien de déconditionnement.`
      );
    }

    const ratio = target.conversionRatio;
    if (ratio === undefined || !Number.isInteger(ratio) || ratio <= 0) {
      throw new Error(
        `Le ratio de conversion de "${target.name}" est invalide. Corrigez la fiche produit.`
      );
    }

    const sourceUnit = source.unit ?? "sac";
    const targetUnit = target.unit ?? "sachet";

    if (source.stockQuantity < args.sourceQuantity) {
      throw new Error(
        `Stock insuffisant pour ${source.name} : disponible ${source.stockQuantity} ${sourceUnit}(s), demandé ${args.sourceQuantity}`
      );
    }

    const targetQuantity = args.sourceQuantity * ratio;
    const now = Date.now();

    const sourcePreviousStock = source.stockQuantity;
    const sourceNewStock = source.stockQuantity - args.sourceQuantity;
    const targetPreviousStock = target.stockQuantity;
    const targetNewStock = target.stockQuantity + targetQuantity;

    const note = args.note?.trim() ? args.note.trim() : undefined;

    // Référence de la conversion
    const conversionReference: string = await ctx.runMutation(
      internal.references.getNextReference,
      { type: "conversion" }
    );

    // En-tête de la conversion
    const conversionId = await ctx.db.insert("conversions", {
      reference: conversionReference,
      date: now,
      sourceProductId: source._id,
      sourceProductName: source.name,
      sourceProductReference: source.reference,
      sourceUnit,
      sourceQuantity: args.sourceQuantity,
      sourcePreviousStock,
      sourceNewStock,
      targetProductId: target._id,
      targetProductName: target.name,
      targetProductReference: target.reference,
      targetUnit,
      conversionRatio: ratio,
      targetQuantity,
      targetPreviousStock,
      targetNewStock,
      note,
      userId: identity.subject,
      userName: user.name,
    });

    // Mise à jour des deux stocks
    await ctx.db.patch(source._id, { stockQuantity: sourceNewStock, updatedAt: now });
    await ctx.db.patch(target._id, { stockQuantity: targetNewStock, updatedAt: now });

    // Jambe source (sortie)
    const sourceMovementRef: string = await ctx.runMutation(
      internal.references.getNextReference,
      { type: "movement" }
    );
    await ctx.db.insert("stockMovements", {
      reference: sourceMovementRef,
      date: now,
      productId: source._id,
      productName: source.name,
      productReference: source.reference,
      type: "conversion",
      quantity: args.sourceQuantity,
      reason: `Conversion ${conversionReference} → ${target.name}`,
      userId: identity.subject,
      userName: user.name,
      previousStock: sourcePreviousStock,
      newStock: sourceNewStock,
      conversionId,
      conversionReference,
    });

    // Jambe cible (entrée)
    const targetMovementRef: string = await ctx.runMutation(
      internal.references.getNextReference,
      { type: "movement" }
    );
    await ctx.db.insert("stockMovements", {
      reference: targetMovementRef,
      date: now,
      productId: target._id,
      productName: target.name,
      productReference: target.reference,
      type: "conversion",
      quantity: targetQuantity,
      reason: `Conversion ${conversionReference} ← ${source.name}`,
      userId: identity.subject,
      userName: user.name,
      previousStock: targetPreviousStock,
      newStock: targetNewStock,
      conversionId,
      conversionReference,
    });

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "stock.converted",
      category: "stock",
      summary: `Conversion ${conversionReference} : −${args.sourceQuantity} ${source.name} → +${targetQuantity} ${target.name} (ratio ${ratio})`,
      targetType: "conversion",
      targetId: conversionId,
      targetRef: conversionReference,
      targetName: `${source.name} → ${target.name}`,
      before: `${source.name}: ${sourcePreviousStock}`,
      after: `${target.name}: ${targetNewStock}`,
    });

    return {
      conversionReference,
      sourceNewStock,
      targetNewStock,
      targetQuantity,
      sourceLowStock: sourceNewStock <= source.alertThreshold,
    };
  },
});

/**
 * Liste des conversions (manager/admin) avec total de la période. Le caissier peut
 * convertir mais ne consulte pas la liste (comme l'historique de stock).
 */
export const getConversions = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const empty = { conversions: [], count: 0 };

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

    let conversions = await ctx.db
      .query("conversions")
      .withIndex("by_date")
      .order("desc")
      .collect();

    if (args.startDate !== undefined) {
      conversions = conversions.filter((c) => c.date >= args.startDate!);
    }
    if (args.endDate !== undefined) {
      conversions = conversions.filter((c) => c.date <= args.endDate!);
    }

    const count = conversions.length;

    if (args.limit) {
      conversions = conversions.slice(0, args.limit);
    }

    return { conversions, count };
  },
});

/**
 * Produits convertibles : produits actifs ayant au moins un produit enfant actif
 * (déclaré via parentProductId). Pour peupler le sélecteur source du formulaire de
 * conversion. Accessible à tous les rôles authentifiés (le caissier convertit).
 */
export const getConvertibleProducts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const products = await ctx.db.query("products").collect();
    const active = products.filter((p) => p.isActive !== false);

    return active
      .map((source) => {
        const children = active
          .filter(
            (c) =>
              c.parentProductId === source._id &&
              c.conversionRatio !== undefined &&
              Number.isInteger(c.conversionRatio) &&
              c.conversionRatio > 0
          )
          .map((c) => ({
            _id: c._id,
            name: c.name,
            unit: c.unit ?? "sachet",
            stockQuantity: c.stockQuantity,
            conversionRatio: c.conversionRatio as number,
          }));
        return {
          _id: source._id,
          name: source.name,
          unit: source.unit ?? "sac",
          stockQuantity: source.stockQuantity,
          alertThreshold: source.alertThreshold,
          children,
        };
      })
      .filter((s) => s.children.length > 0);
  },
});
