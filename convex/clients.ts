import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// ============================================
// QUERIES
// ============================================

/**
 * Récupérer tous les clients actifs
 */
export const getClients = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return [];

    let clients = await ctx.db.query("clients").order("desc").collect();

    // Par défaut, ne montrer que les clients actifs
    if (!args.includeInactive) {
      clients = clients.filter((c) => c.isActive);
    }

    return clients.map((c) => ({
      ...c,
      displayName: formatClientName(c.firstName, c.lastName, c.reference),
    }));
  },
});

/**
 * Rechercher un client par téléphone ou nom
 */
export const searchClients = query({
  args: {
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return [];

    const searchQuery = args.query.toLowerCase().trim();
    if (!searchQuery) return [];

    // Récupérer tous les clients actifs
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // Filtrer par recherche
    const results = clients.filter((c) => {
      const firstName = (c.firstName || "").toLowerCase();
      const lastName = (c.lastName || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      const reference = c.reference.toLowerCase();

      return (
        firstName.includes(searchQuery) ||
        lastName.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        reference.includes(searchQuery) ||
        `${firstName} ${lastName}`.includes(searchQuery) ||
        `${lastName} ${firstName}`.includes(searchQuery)
      );
    });

    return results.slice(0, 10).map((c) => ({
      ...c,
      displayName: formatClientName(c.firstName, c.lastName, c.reference),
    }));
  },
});

/**
 * Récupérer un client par ID
 */
export const getClient = query({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const client = await ctx.db.get(args.clientId);
    if (!client) return null;

    return {
      ...client,
      displayName: formatClientName(client.firstName, client.lastName, client.reference),
    };
  },
});

/**
 * Récupérer un client par référence
 */
export const getClientByReference = query({
  args: {
    reference: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const client = await ctx.db
      .query("clients")
      .withIndex("by_reference", (q) => q.eq("reference", args.reference))
      .unique();

    if (!client) return null;

    return {
      ...client,
      displayName: formatClientName(client.firstName, client.lastName, client.reference),
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Créer un nouveau client
 */
export const createClient = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    clientId: v.id("clients"),
    reference: v.string(),
    displayName: v.string(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("Utilisateur non trouvé");

    // Validation: au moins un champ doit être renseigné
    const hasFirstName = args.firstName?.trim();
    const hasLastName = args.lastName?.trim();
    const hasPhone = args.phone?.trim();

    if (!hasFirstName && !hasLastName && !hasPhone) {
      throw new Error("Veuillez renseigner au moins un nom, prénom ou téléphone");
    }

    // Vérifier si le téléphone existe déjà
    if (hasPhone) {
      const existingClient = await ctx.db
        .query("clients")
        .withIndex("by_phone", (q) => q.eq("phone", hasPhone))
        .first();

      if (existingClient) {
        throw new Error(`Un client existe déjà avec ce numéro: ${existingClient.reference}`);
      }
    }

    // Générer la référence
    const reference: string = await ctx.runMutation(internal.references.getNextReference, {
      type: "client",
    });

    const now = Date.now();

    const clientId = await ctx.db.insert("clients", {
      reference,
      firstName: hasFirstName || undefined,
      lastName: hasLastName || undefined,
      phone: hasPhone || undefined,
      email: args.email?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
      createdById: identity.subject,
      createdByName: user.name,
      isActive: true,
    });

    return {
      clientId,
      reference,
      displayName: formatClientName(
        hasFirstName,
        hasLastName,
        reference
      ),
    };
  },
});

/**
 * Mettre à jour un client
 */
export const updateClient = mutation({
  args: {
    clientId: v.id("clients"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role === "cashier") {
      throw new Error("Accès non autorisé");
    }

    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Client non trouvé");

    const hasPhone = args.phone?.trim();

    // Vérifier si le nouveau téléphone existe déjà (si changé)
    if (hasPhone && hasPhone !== client.phone) {
      const existingClient = await ctx.db
        .query("clients")
        .withIndex("by_phone", (q) => q.eq("phone", hasPhone))
        .first();

      if (existingClient && existingClient._id !== args.clientId) {
        throw new Error(`Un client existe déjà avec ce numéro: ${existingClient.reference}`);
      }
    }

    await ctx.db.patch(args.clientId, {
      firstName: args.firstName?.trim() || undefined,
      lastName: args.lastName?.trim() || undefined,
      phone: hasPhone || undefined,
      email: args.email?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    });

    return { success: true };
  },
});

/**
 * Désactiver un client
 */
export const deactivateClient = mutation({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role === "cashier") {
      throw new Error("Accès non autorisé");
    }

    await ctx.db.patch(args.clientId, { isActive: false });
    return { success: true };
  },
});

/**
 * Réactiver un client
 */
export const reactivateClient = mutation({
  args: {
    clientId: v.id("clients"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role === "cashier") {
      throw new Error("Accès non autorisé");
    }

    await ctx.db.patch(args.clientId, { isActive: true });
    return { success: true };
  },
});

// ============================================
// HELPERS
// ============================================

function formatClientName(
  firstName: string | undefined,
  lastName: string | undefined,
  reference: string
): string {
  const parts: string[] = [];
  if (firstName?.trim()) parts.push(firstName.trim());
  if (lastName?.trim()) parts.push(lastName.trim());

  if (parts.length === 0) {
    return `Client ${reference}`;
  }

  return parts.join(" ");
}
