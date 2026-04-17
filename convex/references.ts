import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

// ============================================
// TYPES DE RÉFÉRENCES
// ============================================

type ReferenceType = "product" | "client" | "sale" | "movement";

// Préfixes pour chaque type
const PREFIXES: Record<ReferenceType, string> = {
  product: "PRD",
  client: "CLI",
  sale: "VNT",
  movement: "MVT",
};

// ============================================
// FONCTIONS UTILITAIRES (internes)
// ============================================

/**
 * Formatte une date en YYYYMMDD
 */
function formatDateForReference(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Génère une référence formatée
 * - Produit/Client: PRD-00001, CLI-00001
 * - Vente/Mouvement: VNT-20260128-00001, MVT-20260128-00001
 */
function formatReference(
  type: ReferenceType,
  count: number,
  dateStr?: string
): string {
  const prefix = PREFIXES[type];
  const paddedCount = String(count).padStart(5, "0");

  if (type === "sale" || type === "movement") {
    return `${prefix}-${dateStr}-${paddedCount}`;
  }

  return `${prefix}-${paddedCount}`;
}

// ============================================
// MUTATION INTERNE: Obtenir le prochain numéro
// ============================================

export const getNextReference = internalMutation({
  args: {
    type: v.union(
      v.literal("product"),
      v.literal("client"),
      v.literal("sale"),
      v.literal("movement")
    ),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = new Date();
    const dateStr = formatDateForReference(now);

    // Pour les types avec date (sale, movement), on utilise le compteur quotidien
    const needsDate = args.type === "sale" || args.type === "movement";
    const queryDate = needsDate ? dateStr : undefined;

    // Chercher le compteur existant
    let counter;
    if (needsDate) {
      counter = await ctx.db
        .query("counters")
        .withIndex("by_type_date", (q) =>
          q.eq("type", args.type).eq("date", queryDate)
        )
        .unique();
    } else {
      counter = await ctx.db
        .query("counters")
        .withIndex("by_type", (q) => q.eq("type", args.type))
        .filter((q) => q.eq(q.field("date"), undefined))
        .first();
    }

    let newCount: number;

    if (counter) {
      // Incrémenter le compteur existant
      newCount = counter.count + 1;
      await ctx.db.patch(counter._id, { count: newCount });
    } else {
      // Créer un nouveau compteur
      newCount = 1;
      await ctx.db.insert("counters", {
        type: args.type,
        date: queryDate,
        count: newCount,
      });
    }

    return formatReference(args.type, newCount, dateStr);
  },
});

// ============================================
// QUERIES
// ============================================

/**
 * Obtenir les statistiques des références
 */
export const getReferenceStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role === "cashier") return null;

    // Compter les différentes entités
    const products = await ctx.db.query("products").collect();
    const clients = await ctx.db.query("clients").collect();
    const sales = await ctx.db.query("sales").collect();
    const movements = await ctx.db.query("stockMovements").collect();

    // Compter ceux avec références
    const productsWithRef = products.filter((p) => p.reference).length;
    const salesWithRef = sales.filter((s) => s.reference).length;
    const movementsWithRef = movements.filter((m) => m.reference).length;

    return {
      products: { total: products.length, withReference: productsWithRef },
      clients: { total: clients.length },
      sales: { total: sales.length, withReference: salesWithRef },
      movements: { total: movements.length, withReference: movementsWithRef },
    };
  },
});

// ============================================
// MIGRATION: Ajouter des références aux données existantes
// ============================================

export const migrateProductReferences = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "admin") {
      throw new Error("Accès admin requis");
    }

    // Récupérer les produits sans référence
    const products = await ctx.db.query("products").collect();
    const productsWithoutRef = products.filter((p) => !p.reference);

    if (productsWithoutRef.length === 0) {
      return { migrated: 0, message: "Tous les produits ont déjà une référence" };
    }

    // Obtenir ou créer le compteur
    let counter = await ctx.db
      .query("counters")
      .withIndex("by_type", (q) => q.eq("type", "product"))
      .filter((q) => q.eq(q.field("date"), undefined))
      .first();

    let currentCount = counter?.count ?? 0;

    // Assigner des références
    for (const product of productsWithoutRef) {
      currentCount++;
      const reference = formatReference("product", currentCount);
      await ctx.db.patch(product._id, { reference });
    }

    // Mettre à jour ou créer le compteur
    if (counter) {
      await ctx.db.patch(counter._id, { count: currentCount });
    } else {
      await ctx.db.insert("counters", {
        type: "product",
        count: currentCount,
      });
    }

    return {
      migrated: productsWithoutRef.length,
      message: `${productsWithoutRef.length} produit(s) migré(s)`,
    };
  },
});
