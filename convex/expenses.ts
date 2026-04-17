import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// HELPERS
// ============================================

function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

// ============================================
// HELPERS - Calcul du montant disponible
// ============================================

function getStartOfDay(dateString: string): number {
  return new Date(dateString + "T00:00:00").getTime();
}

function getEndOfDay(dateString: string): number {
  return new Date(dateString + "T23:59:59.999").getTime();
}

// ============================================
// QUERIES
// ============================================

/**
 * Calculer le montant disponible en caisse pour les dépenses
 * = Ouverture + Ventes espèces - Dépenses retirées - Dépenses approuvées (en attente de retrait)
 */
export const getAvailableCashForExpenses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const today = getTodayDateString();

    // Récupérer la session du jour de l'utilisateur
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (!session || session.status !== "open") {
      return { available: 0, hasOpenSession: false };
    }

    // Récupérer les ventes en espèces de la journée pour ce caissier
    const startOfDay = getStartOfDay(session.date);
    const endOfDay = getEndOfDay(session.date);

    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) =>
        q.and(
          q.gte(q.field("date"), startOfDay),
          q.lte(q.field("date"), endOfDay),
          q.eq(q.field("userId"), session.userId)
        )
      )
      .collect();

    const cashSales = allSales.filter((s) => s.paymentMethod === "cash");
    const totalCashSales = cashSales.reduce((sum, s) => sum + s.total, 0);

    // Récupérer les dépenses déjà retirées pour cette session
    const allWithdrawnExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "withdrawn"))
      .collect();

    const sessionWithdrawnExpenses = allWithdrawnExpenses.filter(
      (e) => e.withdrawnFromSessionId === session._id
    );
    const totalWithdrawn = sessionWithdrawnExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Récupérer les dépenses approuvées en attente de retrait (pour ce demandeur)
    const approvedExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    const myApprovedExpenses = approvedExpenses.filter(
      (e) => e.requesterId === identity.subject
    );
    const totalApprovedPending = myApprovedExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Montant disponible = Ouverture + Ventes espèces - Dépenses retirées - Dépenses approuvées non retirées
    const available = session.openingAmount + totalCashSales - totalWithdrawn - totalApprovedPending;

    return {
      available: Math.max(0, available),
      hasOpenSession: true,
      openingAmount: session.openingAmount,
      totalCashSales,
      totalWithdrawn,
      totalApprovedPending,
    };
  },
});

/**
 * Récupérer les demandes de dépenses en attente (pour admin)
 */
export const getPendingExpenses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Seul l'admin peut voir les demandes en attente
    if (!user || user.role !== "admin") {
      return [];
    }

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    return expenses;
  },
});

/**
 * Compter les demandes de dépenses en attente (pour badge admin)
 */
export const getPendingExpensesCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return 0;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "admin") {
      return 0;
    }

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return expenses.length;
  },
});

/**
 * Récupérer les dépenses approuvées non encore retirées
 */
export const getApprovedExpenses = query({
  args: {},
  handler: async (ctx) => {
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

    // Récupérer les dépenses approuvées
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .order("desc")
      .collect();

    // Caissier: seulement ses propres demandes approuvées
    if (user.role === "cashier") {
      return expenses.filter((e) => e.requesterId === identity.subject);
    }

    return expenses;
  },
});

/**
 * Récupérer les demandes de l'utilisateur connecté
 */
export const getMyExpenses = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    let expenses = await ctx.db
      .query("expenses")
      .withIndex("by_requester", (q) => q.eq("requesterId", identity.subject))
      .order("desc")
      .collect();

    if (args.limit) {
      expenses = expenses.slice(0, args.limit);
    }

    return expenses;
  },
});

/**
 * Historique complet des dépenses (admin/manager)
 */
export const getExpensesHistory = query({
  args: {
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn")
    )),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return [];
    }

    let expenses;
    if (args.status) {
      expenses = await ctx.db
        .query("expenses")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else {
      expenses = await ctx.db
        .query("expenses")
        .withIndex("by_date")
        .order("desc")
        .collect();
    }

    // Filtrer par dates si spécifiées
    if (args.startDate) {
      const startTimestamp = new Date(args.startDate + "T00:00:00").getTime();
      expenses = expenses.filter((e) => e.date >= startTimestamp);
    }
    if (args.endDate) {
      const endTimestamp = new Date(args.endDate + "T23:59:59.999").getTime();
      expenses = expenses.filter((e) => e.date <= endTimestamp);
    }

    if (args.limit) {
      expenses = expenses.slice(0, args.limit);
    }

    return expenses;
  },
});

/**
 * Calculer le total des dépenses retirées pour une session de caisse
 */
export const getWithdrawnExpensesForSession = query({
  args: {
    sessionId: v.optional(v.id("cashSessions")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { total: 0, count: 0, expenses: [] };
    }

    // Si pas de sessionId, chercher la session du jour de l'utilisateur
    let sessionId = args.sessionId;
    if (!sessionId) {
      const today = getTodayDateString();
      const session = await ctx.db
        .query("cashSessions")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", identity.subject).eq("date", today)
        )
        .unique();

      if (!session) {
        return { total: 0, count: 0, expenses: [] };
      }
      sessionId = session._id;
    }

    // Récupérer les dépenses retirées pour cette session
    const allWithdrawn = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "withdrawn"))
      .collect();

    const sessionExpenses = allWithdrawn.filter(
      (e) => e.withdrawnFromSessionId === sessionId
    );

    const total = sessionExpenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      total,
      count: sessionExpenses.length,
      expenses: sessionExpenses,
    };
  },
});

/**
 * Calculer le total des dépenses retirées pour la journée (tous caissiers)
 */
export const getTodayWithdrawnExpenses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { total: 0, count: 0 };
    }

    const today = getTodayDateString();
    const startOfDay = new Date(today + "T00:00:00").getTime();
    const endOfDay = new Date(today + "T23:59:59.999").getTime();

    const allWithdrawn = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "withdrawn"))
      .collect();

    const todayExpenses = allWithdrawn.filter(
      (e) => e.withdrawnAt && e.withdrawnAt >= startOfDay && e.withdrawnAt <= endOfDay
    );

    const total = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      total,
      count: todayExpenses.length,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Créer une demande de dépense (caissier)
 */
export const createExpenseRequest = mutation({
  args: {
    amount: v.number(),
    reason: v.string(),
    category: v.union(
      v.literal("fournitures"),
      v.literal("transport"),
      v.literal("maintenance"),
      v.literal("autre")
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

    if (user.role === "pending") {
      throw new Error("Votre compte est en attente de validation");
    }

    // Validations
    if (args.amount <= 0) {
      throw new Error("Le montant doit être supérieur à 0");
    }

    if (!args.reason.trim()) {
      throw new Error("Le motif est requis");
    }

    // Vérifier qu'une session de caisse est ouverte
    const today = getTodayDateString();
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (!session || session.status !== "open") {
      throw new Error("Vous devez avoir une session de caisse ouverte pour faire une demande de dépense");
    }

    // Calculer le montant disponible en caisse
    const startOfDay = getStartOfDay(session.date);
    const endOfDay = getEndOfDay(session.date);

    // Ventes en espèces
    const allSales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) =>
        q.and(
          q.gte(q.field("date"), startOfDay),
          q.lte(q.field("date"), endOfDay),
          q.eq(q.field("userId"), session.userId)
        )
      )
      .collect();

    const cashSales = allSales.filter((s) => s.paymentMethod === "cash");
    const totalCashSales = cashSales.reduce((sum, s) => sum + s.total, 0);

    // Dépenses déjà retirées pour cette session
    const allWithdrawnExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "withdrawn"))
      .collect();

    const sessionWithdrawnExpenses = allWithdrawnExpenses.filter(
      (e) => e.withdrawnFromSessionId === session._id
    );
    const totalWithdrawn = sessionWithdrawnExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Dépenses approuvées en attente de retrait (pour ce demandeur)
    const approvedExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .collect();

    const myApprovedExpenses = approvedExpenses.filter(
      (e) => e.requesterId === identity.subject
    );
    const totalApprovedPending = myApprovedExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Dépenses en attente de validation (pour ce demandeur)
    const pendingExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const myPendingExpenses = pendingExpenses.filter(
      (e) => e.requesterId === identity.subject
    );
    const totalPending = myPendingExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Montant disponible = Ouverture + Ventes espèces - Retirées - Approuvées - En attente
    const availableAmount = session.openingAmount + totalCashSales - totalWithdrawn - totalApprovedPending - totalPending;

    if (args.amount > availableAmount) {
      const formatPrice = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
      throw new Error(
        `Montant insuffisant en caisse. Disponible: ${formatPrice(Math.max(0, availableAmount))} FCFA`
      );
    }

    const now = Date.now();

    const expenseId = await ctx.db.insert("expenses", {
      date: now,
      amount: args.amount,
      reason: args.reason.trim(),
      category: args.category,
      status: "pending",
      requesterId: identity.subject,
      requesterName: user.name,
    });

    return {
      expenseId,
      amount: args.amount,
      status: "pending",
    };
  },
});

/**
 * Approuver une demande de dépense (admin)
 */
export const approveExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
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
      throw new Error("Seul un administrateur peut approuver les dépenses");
    }

    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Demande de dépense non trouvée");
    }

    if (expense.status !== "pending") {
      throw new Error("Cette demande n'est plus en attente");
    }

    const now = Date.now();

    await ctx.db.patch(args.expenseId, {
      status: "approved",
      approvedById: identity.subject,
      approvedByName: user.name,
      approvedAt: now,
    });

    return {
      expenseId: args.expenseId,
      status: "approved",
      approvedAt: now,
    };
  },
});

/**
 * Rejeter une demande de dépense (admin)
 */
export const rejectExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
    rejectionReason: v.string(),
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
      throw new Error("Seul un administrateur peut rejeter les dépenses");
    }

    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Demande de dépense non trouvée");
    }

    if (expense.status !== "pending") {
      throw new Error("Cette demande n'est plus en attente");
    }

    if (!args.rejectionReason.trim()) {
      throw new Error("Le motif de rejet est requis");
    }

    await ctx.db.patch(args.expenseId, {
      status: "rejected",
      approvedById: identity.subject,
      approvedByName: user.name,
      approvedAt: Date.now(),
      rejectionReason: args.rejectionReason.trim(),
    });

    return {
      expenseId: args.expenseId,
      status: "rejected",
    };
  },
});

/**
 * Retirer une dépense approuvée de la caisse (caissier)
 */
export const withdrawExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
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

    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Demande de dépense non trouvée");
    }

    if (expense.status !== "approved") {
      throw new Error("Cette dépense n'est pas approuvée");
    }

    // Vérifier que le demandeur effectue le retrait ou qu'il est admin
    if (expense.requesterId !== identity.subject && user.role !== "admin") {
      throw new Error("Vous ne pouvez retirer que vos propres dépenses approuvées");
    }

    // Vérifier qu'une session de caisse est ouverte
    const today = getTodayDateString();
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (!session || session.status !== "open") {
      throw new Error("Vous devez avoir une session de caisse ouverte pour retirer des fonds");
    }

    const now = Date.now();

    await ctx.db.patch(args.expenseId, {
      status: "withdrawn",
      withdrawnAt: now,
      withdrawnFromSessionId: session._id,
    });

    return {
      expenseId: args.expenseId,
      status: "withdrawn",
      amount: expense.amount,
      withdrawnAt: now,
      sessionId: session._id,
    };
  },
});

/**
 * Annuler une demande de dépense (par le demandeur, si encore en attente)
 */
export const cancelExpenseRequest = mutation({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Demande de dépense non trouvée");
    }

    // Seul le demandeur peut annuler, et seulement si en attente
    if (expense.requesterId !== identity.subject) {
      throw new Error("Vous ne pouvez annuler que vos propres demandes");
    }

    if (expense.status !== "pending") {
      throw new Error("Seules les demandes en attente peuvent être annulées");
    }

    // Supprimer la demande
    await ctx.db.delete(args.expenseId);

    return {
      expenseId: args.expenseId,
      deleted: true,
    };
  },
});
