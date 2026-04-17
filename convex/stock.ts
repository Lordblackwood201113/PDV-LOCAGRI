import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// QUERIES
// ============================================

/**
 * Historique des mouvements de stock (manager/admin)
 */
export const getStockHistory = query({
  args: {
    productId: v.optional(v.id("products")),
    limit: v.optional(v.number()),
    type: v.optional(
      v.union(v.literal("in"), v.literal("out"), v.literal("adjustment"))
    ),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
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

    // Seuls manager et admin peuvent voir l'historique
    if (!user || user.role === "cashier") {
      return [];
    }

    let movements = await ctx.db
      .query("stockMovements")
      .withIndex("by_date")
      .order("desc")
      .collect();

    // Filtrer par dates si spécifiées
    if (args.startDate) {
      movements = movements.filter((m) => m.date >= args.startDate!);
    }
    if (args.endDate) {
      movements = movements.filter((m) => m.date <= args.endDate!);
    }

    // Filtrer par produit si spécifié
    if (args.productId) {
      movements = movements.filter((m) => m.productId === args.productId);
    }

    // Filtrer par type si spécifié
    if (args.type) {
      movements = movements.filter((m) => m.type === args.type);
    }

    // Limiter le nombre de résultats
    if (args.limit) {
      movements = movements.slice(0, args.limit);
    }

    // Normalize legacy data
    return movements.map((m) => ({
      ...m,
      productName: m.productName ?? "Produit (ancien)",
    }));
  },
});

/**
 * Statistiques de stock pour un produit ou tous les produits
 */
export const getStockStats = query({
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

    if (!user || user.role === "cashier") {
      return null;
    }

    // Récupérer les produits actifs (filter for legacy data compatibility)
    const allProducts = await ctx.db.query("products").collect();
    const products = allProducts
      .filter((p) => p.isActive !== false)
      .map((p) => ({
        ...p,
        unit: p.unit ?? "sac",
        isActive: p.isActive ?? true,
      }));

    if (products.length === 0) {
      return null;
    }

    // Si productId spécifié, filtrer
    const targetProducts = args.productId
      ? products.filter((p) => p._id === args.productId)
      : products;

    // Mouvements des 30 derniers jours
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let recentMovements = await ctx.db
      .query("stockMovements")
      .withIndex("by_date")
      .filter((q) => q.gte(q.field("date"), thirtyDaysAgo))
      .collect();

    // Filtrer par produit si spécifié
    if (args.productId) {
      recentMovements = recentMovements.filter(
        (m) => m.productId === args.productId
      );
    }

    const totalIn = recentMovements
      .filter((m) => m.type === "in")
      .reduce((sum, m) => sum + m.quantity, 0);

    const totalOut = recentMovements
      .filter((m) => m.type === "out")
      .reduce((sum, m) => sum + m.quantity, 0);

    // Stats globales
    const totalStock = targetProducts.reduce((sum, p) => sum + p.stockQuantity, 0);
    const lowStockProducts = targetProducts.filter(
      (p) => p.stockQuantity <= p.alertThreshold
    );

    return {
      totalStock,
      productsCount: targetProducts.length,
      lowStockCount: lowStockProducts.length,
      lowStockProducts: lowStockProducts.map((p) => ({
        id: p._id,
        name: p.name,
        stock: p.stockQuantity,
        threshold: p.alertThreshold,
        unit: p.unit,
      })),
      last30Days: {
        totalIn,
        totalOut,
        netChange: totalIn - totalOut,
        movementsCount: recentMovements.length,
      },
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Ajouter du stock (entrée - manager/admin)
 */
export const addStock = mutation({
  args: {
    productId: v.id("products"),
    quantity: v.number(),
    reason: v.string(),
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

    if (!user || user.role === "cashier") {
      throw new Error("Accès non autorisé - Manager ou Admin requis");
    }

    // Récupérer le produit
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Produit non trouvé");
    }

    // Validations
    if (args.quantity <= 0) {
      throw new Error("La quantité doit être supérieure à 0");
    }

    if (!Number.isInteger(args.quantity)) {
      throw new Error("La quantité doit être un nombre entier");
    }

    if (!args.reason.trim()) {
      throw new Error("Le motif est requis");
    }

    const now = Date.now();
    const newStock = product.stockQuantity + args.quantity;

    // Générer la référence du mouvement
    const movementReference: string = await ctx.runMutation(internal.references.getNextReference, {
      type: "movement",
    });

    // Mettre à jour le stock
    await ctx.db.patch(product._id, {
      stockQuantity: newStock,
      updatedAt: now,
    });

    // Enregistrer le mouvement avec référence
    await ctx.db.insert("stockMovements", {
      reference: movementReference,
      date: now,
      productId: args.productId,
      productName: product.name,
      productReference: product.reference,
      type: "in",
      quantity: args.quantity,
      reason: args.reason.trim(),
      userId: identity.subject,
      userName: user.name,
      previousStock: product.stockQuantity,
      newStock,
    });

    return {
      success: true,
      movementReference,
      newStock,
      productName: product.name,
      unit: product.unit,
    };
  },
});

/**
 * Ajustement de stock (inventaire - manager/admin)
 */
export const adjustStock = mutation({
  args: {
    productId: v.id("products"),
    newQuantity: v.number(),
    reason: v.string(),
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

    if (!user || user.role === "cashier") {
      throw new Error("Accès non autorisé - Manager ou Admin requis");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Produit non trouvé");
    }

    // Validations
    if (args.newQuantity < 0) {
      throw new Error("La quantité ne peut pas être négative");
    }

    if (!Number.isInteger(args.newQuantity)) {
      throw new Error("La quantité doit être un nombre entier");
    }

    if (!args.reason.trim()) {
      throw new Error("Le motif est requis");
    }

    const now = Date.now();
    const difference = args.newQuantity - product.stockQuantity;

    // Générer la référence du mouvement
    const movementReference: string = await ctx.runMutation(internal.references.getNextReference, {
      type: "movement",
    });

    // Mettre à jour le stock
    await ctx.db.patch(product._id, {
      stockQuantity: args.newQuantity,
      updatedAt: now,
    });

    // Enregistrer le mouvement d'ajustement avec référence
    await ctx.db.insert("stockMovements", {
      reference: movementReference,
      date: now,
      productId: args.productId,
      productName: product.name,
      productReference: product.reference,
      type: "adjustment",
      quantity: Math.abs(difference),
      reason: `${args.reason.trim()} (${difference >= 0 ? "+" : ""}${difference})`,
      userId: identity.subject,
      userName: user.name,
      previousStock: product.stockQuantity,
      newStock: args.newQuantity,
    });

    return {
      success: true,
      movementReference,
      previousStock: product.stockQuantity,
      newStock: args.newQuantity,
      difference,
      productName: product.name,
      unit: product.unit,
    };
  },
});
