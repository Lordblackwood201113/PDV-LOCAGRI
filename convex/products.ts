import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// QUERIES
// ============================================

/**
 * Récupérer tous les produits actifs
 */
export const getProducts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const products = await ctx.db.query("products").collect();

    // Filter active products and normalize legacy data
    return products
      .filter((p) => p.isActive !== false) // Include if isActive is true or undefined (legacy)
      .map((p) => ({
        ...p,
        unit: p.unit ?? "sac", // Default unit for legacy data
        isActive: p.isActive ?? true,
        createdAt: p.createdAt ?? p.updatedAt,
      }));
  },
});

/**
 * Récupérer tous les produits (y compris inactifs) - admin/manager
 */
export const getAllProducts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const products = await ctx.db.query("products").collect();

    // Normalize legacy data
    return products.map((p) => ({
      ...p,
      unit: p.unit ?? "sac",
      isActive: p.isActive ?? true,
      createdAt: p.createdAt ?? p.updatedAt,
    }));
  },
});

/**
 * Récupérer un produit par son ID
 */
export const getProductById = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const product = await ctx.db.get(args.productId);
    if (!product) return null;

    // Normalize legacy data
    return {
      ...product,
      unit: product.unit ?? "sac",
      isActive: product.isActive ?? true,
      createdAt: product.createdAt ?? product.updatedAt,
    };
  },
});

/**
 * Récupérer le premier produit (rétrocompatibilité)
 * @deprecated Utiliser getProducts à la place
 */
export const getProduct = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const products = await ctx.db.query("products").collect();
    const activeProducts = products.filter((p) => p.isActive !== false);
    const product = activeProducts[0];
    if (!product) return null;

    // Normalize legacy data
    return {
      ...product,
      unit: product.unit ?? "sac",
      isActive: product.isActive ?? true,
      createdAt: product.createdAt ?? product.updatedAt,
    };
  },
});

/**
 * Vérifier si au moins un produit est configuré
 */
export const isProductConfigured = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();
    const activeProducts = products.filter((p) => p.isActive !== false);
    return activeProducts.length > 0;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Ajouter un nouveau produit (admin seulement)
 */
export const addProduct = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    stockQuantity: v.number(),
    alertThreshold: v.number(),
    unit: v.string(),
  },
  returns: v.object({
    productId: v.id("products"),
    reference: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    // Vérifier les droits admin
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    // Validation des données
    if (!args.name.trim()) {
      throw new Error("Le nom du produit est requis");
    }
    if (args.price <= 0) {
      throw new Error("Le prix doit être supérieur à 0");
    }
    if (args.stockQuantity < 0) {
      throw new Error("Le stock ne peut pas être négatif");
    }
    if (args.alertThreshold < 0) {
      throw new Error("Le seuil d'alerte ne peut pas être négatif");
    }
    if (!args.unit.trim()) {
      throw new Error("L'unité de mesure est requise");
    }

    // Générer la référence produit
    const productReference: string = await ctx.runMutation(internal.references.getNextReference, {
      type: "product",
    });

    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      reference: productReference,
      name: args.name.trim(),
      description: args.description?.trim(),
      price: args.price,
      stockQuantity: args.stockQuantity,
      alertThreshold: args.alertThreshold,
      unit: args.unit.trim(),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Créer un mouvement de stock initial si stock > 0
    if (args.stockQuantity > 0) {
      const movementReference: string = await ctx.runMutation(internal.references.getNextReference, {
        type: "movement",
      });

      await ctx.db.insert("stockMovements", {
        reference: movementReference,
        date: now,
        productId: productId,
        productName: args.name.trim(),
        productReference: productReference,
        type: "in",
        quantity: args.stockQuantity,
        reason: "Stock initial",
        userId: identity.subject,
        userName: user.name,
        previousStock: 0,
        newStock: args.stockQuantity,
      });
    }

    return { productId, reference: productReference };
  },
});

/**
 * Initialiser le premier produit (rétrocompatibilité)
 * @deprecated Utiliser addProduct à la place
 */
export const initProduct = mutation({
  args: {
    name: v.string(),
    price: v.number(),
    stockQuantity: v.number(),
    alertThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    // Vérifier les droits admin
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    // Vérifier qu'aucun produit n'existe
    const existing = await ctx.db.query("products").collect();
    if (existing.length > 0) {
      throw new Error("Des produits existent déjà. Utilisez 'Ajouter un produit'.");
    }

    // Validation des données
    if (args.price <= 0) {
      throw new Error("Le prix doit être supérieur à 0");
    }
    if (args.stockQuantity < 0) {
      throw new Error("Le stock ne peut pas être négatif");
    }
    if (args.alertThreshold < 0) {
      throw new Error("Le seuil d'alerte ne peut pas être négatif");
    }

    const now = Date.now();
    const productId = await ctx.db.insert("products", {
      name: args.name,
      price: args.price,
      stockQuantity: args.stockQuantity,
      alertThreshold: args.alertThreshold,
      unit: "sac", // Unité par défaut
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Créer un mouvement de stock initial si stock > 0
    if (args.stockQuantity > 0) {
      await ctx.db.insert("stockMovements", {
        date: now,
        productId: productId,
        productName: args.name,
        type: "in",
        quantity: args.stockQuantity,
        reason: "Stock initial",
        userId: identity.subject,
        userName: user.name,
        previousStock: 0,
        newStock: args.stockQuantity,
      });
    }

    return productId;
  },
});

/**
 * Mettre à jour un produit (admin seulement)
 */
export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    alertThreshold: v.number(),
    unit: v.string(),
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

    if (!user || user.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Produit non trouvé");
    }

    // Validations
    if (!args.name.trim()) {
      throw new Error("Le nom du produit est requis");
    }
    if (args.price <= 0) {
      throw new Error("Le prix doit être supérieur à 0");
    }
    if (args.alertThreshold < 0) {
      throw new Error("Le seuil d'alerte ne peut pas être négatif");
    }

    await ctx.db.patch(args.productId, {
      name: args.name.trim(),
      description: args.description?.trim(),
      price: args.price,
      alertThreshold: args.alertThreshold,
      unit: args.unit.trim(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Archiver/Désarchiver un produit (admin seulement)
 */
export const toggleProductActive = mutation({
  args: {
    productId: v.id("products"),
    isActive: v.boolean(),
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

    if (!user || user.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Produit non trouvé");
    }

    await ctx.db.patch(args.productId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Supprimer un produit (admin seulement)
 * Attention: Ne supprime que si aucune vente n'est associée
 */
export const deleteProduct = mutation({
  args: {
    productId: v.id("products"),
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

    if (!user || user.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new Error("Produit non trouvé");
    }

    // Vérifier si des ventes existent pour ce produit (scan all sales)
    const allSales = await ctx.db.query("sales").collect();
    const productSales = allSales.find((s) => s.productId === args.productId);

    if (productSales) {
      throw new Error("Impossible de supprimer: des ventes sont associées à ce produit. Archivez-le plutôt.");
    }

    // Supprimer les mouvements de stock associés (scan all movements)
    const allMovements = await ctx.db.query("stockMovements").collect();
    const movements = allMovements.filter((m) => m.productId === args.productId);

    for (const movement of movements) {
      await ctx.db.delete(movement._id);
    }

    // Supprimer le produit
    await ctx.db.delete(args.productId);

    return { success: true };
  },
});

// ============================================
// DEPRECATED - À supprimer après migration
// ============================================

/**
 * @deprecated Utiliser updateProduct avec productId
 */
export const updatePrice = mutation({
  args: {
    price: v.number(),
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

    if (!user || user.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    const products = await ctx.db.query("products").collect();
    const product = products[0];
    if (!product) {
      throw new Error("Produit non configuré");
    }

    if (args.price <= 0) {
      throw new Error("Le prix doit être supérieur à 0");
    }

    await ctx.db.patch(product._id, {
      price: args.price,
      updatedAt: Date.now(),
    });

    return { success: true, newPrice: args.price };
  },
});

/**
 * @deprecated Utiliser updateProduct avec productId
 */
export const updateAlertThreshold = mutation({
  args: {
    alertThreshold: v.number(),
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

    if (!user || user.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    const products = await ctx.db.query("products").collect();
    const product = products[0];
    if (!product) {
      throw new Error("Produit non configuré");
    }

    if (args.alertThreshold < 0) {
      throw new Error("Le seuil d'alerte ne peut pas être négatif");
    }

    await ctx.db.patch(product._id, {
      alertThreshold: args.alertThreshold,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
