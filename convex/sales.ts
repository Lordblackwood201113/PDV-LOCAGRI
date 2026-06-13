import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// QUERIES
// ============================================

/**
 * Récupérer les ventes du jour
 */
export const getTodaySales = query({
  args: {
    productId: v.optional(v.id("products")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    // Début du jour (minuit local)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime();

    let sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.gte(q.field("date"), startOfDay))
      .order("desc")
      .collect();

    // Filtrer par produit si spécifié
    if (args.productId) {
      sales = sales.filter((s) => s.productId === args.productId);
    }

    // Les caissiers ne voient que leurs propres ventes
    if (user.role === "cashier") {
      sales = sales.filter((s) => s.userId === identity.subject);
    }

    // Normalize legacy data
    return sales.map((s) => ({
      ...s,
      productName: s.productName ?? "Produit (ancien)",
    }));
  },
});

/**
 * Statistiques des ventes du jour
 */
export const getTodayStats = query({
  args: {
    productId: v.optional(v.id("products")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    // Début du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime();

    let sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.gte(q.field("date"), startOfDay))
      .collect();

    // Filtrer par produit si spécifié
    if (args.productId) {
      sales = sales.filter((s) => s.productId === args.productId);
    }

    // Filtrer pour les caissiers
    if (user.role === "cashier") {
      sales = sales.filter((s) => s.userId === identity.subject);
    }

    const totalAmount = sales.reduce((sum, s) => sum + s.total, 0);
    const totalQuantity = sales.reduce((sum, s) => sum + s.quantity, 0);
    const cashSales = sales.filter((s) => s.paymentMethod === "cash");
    const mobileSales = sales.filter((s) => s.paymentMethod === "mobile_money");
    const creditSales = sales.filter((s) => s.paymentMethod === "credit");

    // Statistiques par produit
    const byProduct: Record<string, { name: string; quantity: number; amount: number }> = {};
    for (const sale of sales) {
      const key = sale.productId ?? "legacy"; // Handle legacy sales without productId
      if (!byProduct[key]) {
        byProduct[key] = { name: sale.productName ?? "Produit (ancien)", quantity: 0, amount: 0 };
      }
      byProduct[key].quantity += sale.quantity;
      byProduct[key].amount += sale.total;
    }

    return {
      salesCount: sales.length,
      totalAmount,
      totalQuantity,
      cashAmount: cashSales.reduce((sum, s) => sum + s.total, 0),
      cashCount: cashSales.length,
      mobileAmount: mobileSales.reduce((sum, s) => sum + s.total, 0),
      mobileCount: mobileSales.length,
      creditAmount: creditSales.reduce((sum, s) => sum + s.total, 0),
      creditCount: creditSales.length,
      byProduct: Object.entries(byProduct).map(([id, data]) => ({
        productId: id,
        ...data,
      })),
    };
  },
});

/**
 * Statistiques des ventes des derniers jours (pour le graphique)
 */
export const getSalesEvolution = query({
  args: {
    days: v.optional(v.number()), // Nombre de jours (défaut: 7)
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    const numberOfDays = args.days ?? 7;
    const now = new Date();

    // Créer un tableau pour les N derniers jours
    const dailyStats: { date: string; dateLabel: string; amount: number; count: number }[] = [];

    for (let i = numberOfDays - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);

      const dayStr = day.toISOString().split('T')[0]; // YYYY-MM-DD
      const dayLabel = day.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });

      dailyStats.push({
        date: dayStr,
        dateLabel: dayLabel,
        amount: 0,
        count: 0,
      });
    }

    // Récupérer toutes les ventes de la période
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (numberOfDays - 1));
    startDate.setHours(0, 0, 0, 0);

    let sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.gte(q.field("date"), startDate.getTime()))
      .collect();

    // Les caissiers ne voient que leurs propres ventes
    if (user.role === "cashier") {
      sales = sales.filter((s) => s.userId === identity.subject);
    }

    // Agréger les ventes par jour
    for (const sale of sales) {
      const saleDate = new Date(sale.date);
      const saleDateStr = saleDate.toISOString().split('T')[0];

      const dayIndex = dailyStats.findIndex((d) => d.date === saleDateStr);
      if (dayIndex !== -1) {
        dailyStats[dayIndex].amount += sale.total;
        dailyStats[dayIndex].count += 1;
      }
    }

    return dailyStats;
  },
});

/**
 * Historique des ventes avec filtres (manager/admin)
 */
export const getSalesHistory = query({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    productId: v.optional(v.id("products")),
    clientId: v.optional(v.id("clients")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return [];
    }

    let sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .order("desc")
      .collect();

    // Les caissiers ne voient que leurs propres ventes
    if (user.role === "cashier") {
      sales = sales.filter((s) => s.userId === identity.subject);
    }

    // Filtrer par dates si spécifiées
    if (args.startDate) {
      sales = sales.filter((s) => s.date >= args.startDate!);
    }
    if (args.endDate) {
      sales = sales.filter((s) => s.date <= args.endDate!);
    }

    // Filtrer par produit si spécifié
    if (args.productId) {
      sales = sales.filter((s) => s.productId === args.productId);
    }

    // Filtrer par client si spécifié
    if (args.clientId) {
      sales = sales.filter((s) => s.clientId === args.clientId);
    }

    // Limiter le nombre de résultats
    if (args.limit) {
      sales = sales.slice(0, args.limit);
    }

    // Normalize legacy data
    return sales.map((s) => ({
      ...s,
      productName: s.productName ?? "Produit (ancien)",
    }));
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Créer une vente
 */
export const createSale = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(),
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("mobile_money"),
      v.literal("credit")
    ),
    clientId: v.optional(v.id("clients")), // Client optionnel (obligatoire si crédit)
    unitPrice: v.optional(v.number()),     // Prix unitaire libre (grossiste uniquement)
    amountReceived: v.optional(v.number()), // Espèces remises par le client (vente espèces)
    changeMethod: v.optional(             // Comment la monnaie est rendue (si monnaie > 0)
      v.union(v.literal("cash"), v.literal("mobile_money"))
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    // Récupérer l'utilisateur
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

    // Récupérer le produit
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Produit non trouvé");
    }

    // Handle legacy data - isActive may be undefined (treat as active)
    if (product.isActive === false) {
      throw new Error("Ce produit n'est plus disponible à la vente");
    }

    // Normalize legacy data
    const productUnit = product.unit ?? "sac";

    // Validations
    if (args.quantity <= 0) {
      throw new Error("La quantité doit être supérieure à 0");
    }

    if (!Number.isInteger(args.quantity)) {
      throw new Error("La quantité doit être un nombre entier");
    }

    if (product.stockQuantity < args.quantity) {
      throw new Error(
        `Stock insuffisant pour ${product.name}. Disponible: ${product.stockQuantity} ${productUnit}(s)`
      );
    }

    // Récupérer le client si spécifié
    let client = null;
    let clientName: string | undefined;
    let clientReference: string | undefined;
    if (args.clientId) {
      client = await ctx.db.get(args.clientId);
      if (client) {
        clientReference = client.reference;
        // Construire le nom du client
        const parts: string[] = [];
        if (client.firstName?.trim()) parts.push(client.firstName.trim());
        if (client.lastName?.trim()) parts.push(client.lastName.trim());
        clientName = parts.length > 0 ? parts.join(" ") : `Client ${client.reference}`;
      }
    }

    // Type de client (défaut: particulier si non spécifié ou vente sans client)
    const clientType: "particulier" | "grossiste" = client?.type ?? "particulier";

    // Prix unitaire effectif appliqué :
    // - grossiste                    -> prix saisi librement par le caissier (entier > 0 requis)
    // - particulier / sans client    -> prix catalogue du produit (tout prix transmis est ignoré)
    let effectiveUnitPrice: number;
    if (clientType === "grossiste") {
      if (
        args.unitPrice === undefined ||
        !Number.isInteger(args.unitPrice) ||
        args.unitPrice <= 0
      ) {
        throw new Error("Prix de gros invalide : saisissez un montant entier positif.");
      }
      effectiveUnitPrice = args.unitPrice;
    } else {
      effectiveUnitPrice = product.price;
    }

    const now = Date.now();
    const total = effectiveUnitPrice * args.quantity;
    const newStock = product.stockQuantity - args.quantity;

    // Vente à crédit (ardoise) : client identifié obligatoire, tout ou rien
    const isCredit = args.paymentMethod === "credit";
    if (isCredit && !client) {
      throw new Error("Une vente à crédit nécessite un client identifié");
    }
    const paymentStatus: "paid" | "unpaid" = isCredit ? "unpaid" : "paid";
    const amountDue = isCredit ? total : 0;

    // Encaissement & monnaie à rendre (vente espèces avec montant reçu fourni)
    let amountReceived: number | undefined;
    let changeDue: number | undefined;
    let changeMethod: "cash" | "mobile_money" | undefined;
    let mobileMoneyChange: number | undefined;
    if (args.paymentMethod === "cash" && args.amountReceived !== undefined) {
      if (args.amountReceived < total) {
        throw new Error("Le montant reçu est inférieur au total");
      }
      amountReceived = args.amountReceived;
      changeDue = amountReceived - total;
      if (changeDue > 0 && args.changeMethod === undefined) {
        throw new Error(
          "Précisez comment la monnaie est rendue (espèces ou Mobile Money)"
        );
      }
      changeMethod = changeDue > 0 ? args.changeMethod : undefined;
      mobileMoneyChange = changeMethod === "mobile_money" ? changeDue : 0;
    }

    // Générer les références
    const saleReference: string = await ctx.runMutation(internal.references.getNextReference, {
      type: "sale",
    });
    const movementReference: string = await ctx.runMutation(internal.references.getNextReference, {
      type: "movement",
    });

    // Créer la vente avec référence
    const saleId = await ctx.db.insert("sales", {
      reference: saleReference,
      date: now,
      productId: args.productId,
      productName: product.name,
      productReference: product.reference,
      quantity: args.quantity,
      unitPrice: effectiveUnitPrice,
      total,
      paymentMethod: args.paymentMethod,
      paymentStatus,
      amountDue,
      amountReceived,
      changeDue,
      changeMethod,
      mobileMoneyChange,
      clientId: args.clientId,
      clientReference,
      clientName,
      clientType,
      userId: identity.subject,
      userName: user.name,
    });

    // Mettre à jour le stock du produit
    await ctx.db.patch(product._id, {
      stockQuantity: newStock,
      updatedAt: now,
    });

    // Enregistrer le mouvement de stock avec référence
    await ctx.db.insert("stockMovements", {
      reference: movementReference,
      date: now,
      productId: args.productId,
      productName: product.name,
      productReference: product.reference,
      type: "out",
      quantity: args.quantity,
      reason: `Vente ${saleReference}`,
      userId: identity.subject,
      userName: user.name,
      previousStock: product.stockQuantity,
      newStock,
      saleId,
      saleReference,
    });

    // Crédit : augmenter l'encours du client (atomique avec la vente)
    let clientBalanceAfter: number | undefined;
    if (isCredit && client) {
      clientBalanceAfter = (client.balance ?? 0) + total;
      await ctx.db.patch(client._id, { balance: clientBalanceAfter });
    }

    return {
      saleId,
      saleReference,
      total,
      newStock,
      isLowStock: newStock <= product.alertThreshold,
      productName: product.name,
      unit: productUnit,
      clientName,
      changeDue,
      changeMethod,
      isCredit,
      clientBalanceAfter,
    };
  },
});
