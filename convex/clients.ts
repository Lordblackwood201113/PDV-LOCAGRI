import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { writeAuditLog } from "./audit";

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
      type: c.type ?? "particulier",
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
      const quartier = (c.quartier || "").toLowerCase();

      return (
        firstName.includes(searchQuery) ||
        lastName.includes(searchQuery) ||
        phone.includes(searchQuery) ||
        reference.includes(searchQuery) ||
        quartier.includes(searchQuery) ||
        `${firstName} ${lastName}`.includes(searchQuery) ||
        `${lastName} ${firstName}`.includes(searchQuery)
      );
    });

    return results.slice(0, 10).map((c) => ({
      ...c,
      type: c.type ?? "particulier",
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

/**
 * Liste des clients débiteurs (encours > 0) + total des créances
 */
export const getReceivables = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { clients: [], totalOutstanding: 0, debtorCount: 0 };

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return { clients: [], totalOutstanding: 0, debtorCount: 0 };

    const activeClients = await ctx.db
      .query("clients")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const debtors = activeClients
      .filter((c) => (c.balance ?? 0) > 0)
      .map((c) => ({
        ...c,
        balance: c.balance ?? 0,
        displayName: formatClientName(c.firstName, c.lastName, c.reference),
      }))
      .sort((a, b) => b.balance - a.balance);

    return {
      clients: debtors,
      totalOutstanding: debtors.reduce((sum, c) => sum + c.balance, 0),
      debtorCount: debtors.length,
    };
  },
});

/**
 * Ardoise d'un client : ventes à crédit + règlements + encours
 */
export const getClientLedger = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const client = await ctx.db.get(args.clientId);
    if (!client) return null;

    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    const creditSales = allSales
      .filter((s) => s.paymentMethod === "credit")
      .sort((a, b) => b.date - a.date)
      .map((s) => ({
        _id: s._id,
        reference: s.reference,
        date: s.date,
        total: s.total,
        amountDue: s.amountDue ?? s.total,
        paymentStatus: s.paymentStatus ?? "unpaid",
        productName: s.productName ?? "Produit",
      }));

    const payments = (
      await ctx.db
        .query("clientPayments")
        .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
        .collect()
    ).sort((a, b) => b.date - a.date);

    return {
      client: {
        ...client,
        balance: client.balance ?? 0,
        displayName: formatClientName(client.firstName, client.lastName, client.reference),
      },
      creditSales,
      payments,
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
    quartier: v.optional(v.string()),
    notes: v.optional(v.string()),
    type: v.optional(v.union(v.literal("particulier"), v.literal("grossiste"))),
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
      quartier: args.quartier?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      type: args.type ?? "particulier",
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
    quartier: v.optional(v.string()),
    notes: v.optional(v.string()),
    type: v.optional(v.union(v.literal("particulier"), v.literal("grossiste"))),
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
      quartier: args.quartier?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      // Préserver le type existant si non fourni (défaut: particulier)
      type: args.type ?? client.type ?? "particulier",
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

    const client = await ctx.db.get(args.clientId);
    await ctx.db.patch(args.clientId, { isActive: false });

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "client.deactivated",
      category: "client",
      summary: `Client archivé : ${client ? formatClientName(client.firstName, client.lastName, client.reference) : args.clientId}`,
      targetType: "client",
      targetId: args.clientId,
      targetRef: client?.reference,
      before: "actif",
      after: "archivé",
    });

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

    const client = await ctx.db.get(args.clientId);
    await ctx.db.patch(args.clientId, { isActive: true });

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "client.reactivated",
      category: "client",
      summary: `Client réactivé : ${client ? formatClientName(client.firstName, client.lastName, client.reference) : args.clientId}`,
      targetType: "client",
      targetId: args.clientId,
      targetRef: client?.reference,
      before: "archivé",
      after: "actif",
    });

    return { success: true };
  },
});

/**
 * Encaisser un règlement (remboursement de crédit) d'un client
 * - Décrémente l'encours, alloue en FIFO aux ventes impayées
 * - Règlement espèces : exige une caisse ouverte et y est rattaché (réconciliation)
 */
export const recordClientPayment = mutation({
  args: {
    clientId: v.id("clients"),
    amount: v.number(),
    method: v.union(v.literal("cash"), v.literal("mobile_money")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("Utilisateur non trouvé");
    if (!user.isActive) throw new Error("Compte utilisateur désactivé");

    const client = await ctx.db.get(args.clientId);
    if (!client) throw new Error("Client non trouvé");

    const balance = client.balance ?? 0;
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("Le montant du règlement doit être supérieur à 0");
    }
    if (args.amount > balance) {
      throw new Error(
        `Le règlement dépasse l'encours du client (encours: ${balance} FCFA)`
      );
    }

    // Règlement espèces : session de caisse ouverte obligatoire (réconciliation)
    let sessionId: Id<"cashSessions"> | undefined;
    if (args.method === "cash") {
      const today = new Date().toISOString().split("T")[0];
      const session = await ctx.db
        .query("cashSessions")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", identity.subject).eq("date", today)
        )
        .unique();
      if (!session || session.status !== "open") {
        throw new Error(
          "Ouvrez votre caisse pour encaisser un règlement en espèces"
        );
      }
      sessionId = session._id;
    }

    const now = Date.now();
    const balanceAfter = balance - args.amount;

    // Décrémenter l'encours du client
    await ctx.db.patch(client._id, { balance: balanceAfter });

    // Allocation FIFO : solder les ventes à crédit impayées les plus anciennes
    let remaining = args.amount;
    const clientSales = await ctx.db
      .query("sales")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const unpaidCredit = clientSales
      .filter((s) => s.paymentMethod === "credit" && s.paymentStatus === "unpaid")
      .sort((a, b) => a.date - b.date);
    for (const sale of unpaidCredit) {
      if (remaining <= 0) break;
      const due = sale.amountDue ?? sale.total;
      const applied = Math.min(remaining, due);
      const newDue = due - applied;
      await ctx.db.patch(sale._id, {
        amountDue: newDue,
        paymentStatus: newDue <= 0 ? "paid" : "unpaid",
      });
      remaining -= applied;
    }

    const reference: string = await ctx.runMutation(
      internal.references.getNextReference,
      { type: "payment" }
    );

    const clientName = formatClientName(
      client.firstName,
      client.lastName,
      client.reference
    );

    await ctx.db.insert("clientPayments", {
      reference,
      clientId: client._id,
      clientReference: client.reference,
      clientName,
      amount: args.amount,
      method: args.method,
      date: now,
      userId: identity.subject,
      userName: user.name,
      sessionId,
      note: args.note?.trim() || undefined,
      balanceAfter,
    });

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "client.payment_recorded",
      category: "client",
      summary: `Règlement ${reference} de ${args.amount} FCFA (${args.method === "cash" ? "espèces" : "Mobile Money"}) — ${clientName}, reste dû ${balanceAfter} FCFA`,
      targetType: "client",
      targetId: client._id,
      targetRef: client.reference,
      before: String(balance),
      after: String(balanceAfter),
      metadata: `reglement=${reference}; methode=${args.method}; montant=${args.amount}`,
    });

    return { reference, balanceAfter };
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
