import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { writeAuditLog } from "./audit";

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
    // Déconditionnement : produit issu de la conversion d'un autre produit
    parentProductId: v.optional(v.id("products")),
    conversionRatio: v.optional(v.number()),
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

    // Lien de déconditionnement (optionnel) : parent + ratio cohérents
    if (args.parentProductId !== undefined) {
      const parent = await ctx.db.get(args.parentProductId);
      if (!parent) {
        throw new Error("Produit source (parent) introuvable");
      }
      if (parent.isActive === false) {
        throw new Error("Le produit source (parent) est archivé");
      }
      if (
        args.conversionRatio === undefined ||
        !Number.isInteger(args.conversionRatio) ||
        args.conversionRatio <= 0
      ) {
        throw new Error("Le ratio de conversion doit être un entier supérieur à 0");
      }
    } else if (args.conversionRatio !== undefined) {
      throw new Error("Un ratio de conversion nécessite un produit source");
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
      parentProductId: args.parentProductId,
      conversionRatio: args.parentProductId !== undefined ? args.conversionRatio : undefined,
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

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "product.created",
      category: "product",
      summary: `Produit créé : ${args.name.trim()} — prix ${args.price} FCFA, stock initial ${args.stockQuantity}`,
      targetType: "product",
      targetId: productId,
      targetRef: productReference,
      targetName: args.name.trim(),
      after: String(args.price),
    });

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
    // Déconditionnement : produit issu de la conversion d'un autre produit
    parentProductId: v.optional(v.id("products")),
    conversionRatio: v.optional(v.number()),
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

    // Lien de déconditionnement (optionnel)
    if (args.parentProductId !== undefined) {
      if (args.parentProductId === args.productId) {
        throw new Error("Un produit ne peut pas être issu de lui-même");
      }
      const parent = await ctx.db.get(args.parentProductId);
      if (!parent) {
        throw new Error("Produit source (parent) introuvable");
      }
      if (parent.isActive === false) {
        throw new Error("Le produit source (parent) est archivé");
      }
      if (
        args.conversionRatio === undefined ||
        !Number.isInteger(args.conversionRatio) ||
        args.conversionRatio <= 0
      ) {
        throw new Error("Le ratio de conversion doit être un entier supérieur à 0");
      }
    } else if (args.conversionRatio !== undefined) {
      throw new Error("Un ratio de conversion nécessite un produit source");
    }

    await ctx.db.patch(args.productId, {
      name: args.name.trim(),
      description: args.description?.trim(),
      price: args.price,
      alertThreshold: args.alertThreshold,
      unit: args.unit.trim(),
      // undefined efface le champ (lien retiré si la case est décochée)
      parentProductId: args.parentProductId,
      conversionRatio: args.parentProductId !== undefined ? args.conversionRatio : undefined,
      updatedAt: Date.now(),
    });

    const priceChanged = product.price !== args.price;
    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "product.updated",
      category: "product",
      summary: priceChanged
        ? `Produit modifié : ${args.name.trim()} — prix ${product.price} → ${args.price} FCFA`
        : `Produit modifié : ${args.name.trim()}`,
      targetType: "product",
      targetId: args.productId,
      targetName: args.name.trim(),
      ...(priceChanged
        ? { before: String(product.price), after: String(args.price) }
        : {}),
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

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: args.isActive ? "product.unarchived" : "product.archived",
      category: "product",
      summary: `Produit ${args.isActive ? "réactivé" : "archivé"} : ${product.name}`,
      targetType: "product",
      targetId: args.productId,
      targetName: product.name,
      before: args.isActive ? "archivé" : "actif",
      after: args.isActive ? "actif" : "archivé",
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

    // Capturer les infos du produit AVANT suppression (pour le journal)
    const deletedName = product.name;
    const deletedRef = product.reference ?? String(args.productId);

    // Supprimer le produit
    await ctx.db.delete(args.productId);

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "product.deleted",
      category: "product",
      summary: `Produit supprimé : ${deletedName} (${deletedRef})`,
      targetType: "product",
      targetId: args.productId,
      targetRef: deletedRef,
      targetName: deletedName,
    });

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
