import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// HELPERS
// ============================================

/**
 * Obtenir la date du jour au format "YYYY-MM-DD"
 */
function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Obtenir le début du jour (minuit) en timestamp
 */
function getStartOfDay(dateString: string): number {
  return new Date(dateString + "T00:00:00").getTime();
}

/**
 * Obtenir la fin du jour (23:59:59) en timestamp
 */
function getEndOfDay(dateString: string): number {
  return new Date(dateString + "T23:59:59.999").getTime();
}

// ============================================
// QUERIES
// ============================================

/**
 * Récupérer la session de caisse du jour pour l'utilisateur connecté
 */
export const getCurrentSession = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const today = getTodayDateString();

    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    return session;
  },
});

/**
 * Calculer le montant attendu (théorique) pour une session
 * = Montant d'ouverture + Ventes en espèces - Dépenses retirées
 */
export const calculateExpectedAmount = query({
  args: {
    sessionId: v.optional(v.id("cashSessions")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    // Récupérer la session (soit par ID, soit la session du jour)
    let session;
    if (args.sessionId) {
      session = await ctx.db.get(args.sessionId);
    } else {
      const today = getTodayDateString();
      session = await ctx.db
        .query("cashSessions")
        .withIndex("by_user_date", (q) =>
          q.eq("userId", identity.subject).eq("date", today)
        )
        .unique();
    }

    if (!session) {
      return null;
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

    // Filtrer les ventes en espèces
    const cashSales = allSales.filter((s) => s.paymentMethod === "cash");
    const totalCashSales = cashSales.reduce((sum, s) => sum + s.total, 0);

    // Ventes Mobile Money (pour info)
    const mobileSales = allSales.filter((s) => s.paymentMethod === "mobile_money");
    const totalMobileSales = mobileSales.reduce((sum, s) => sum + s.total, 0);

    // Récupérer les dépenses retirées pour cette session
    const allWithdrawnExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "withdrawn"))
      .collect();

    const sessionExpenses = allWithdrawnExpenses.filter(
      (e) => e.withdrawnFromSessionId === session._id
    );
    const totalExpenses = sessionExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Montant attendu = Ouverture + Ventes espèces - Dépenses retirées
    const expectedAmount = session.openingAmount + totalCashSales - totalExpenses;

    return {
      openingAmount: session.openingAmount,
      totalCashSales,
      totalMobileSales,
      totalExpenses,
      expectedAmount,
      salesCount: allSales.length,
      cashSalesCount: cashSales.length,
      mobileSalesCount: mobileSales.length,
      expensesCount: sessionExpenses.length,
    };
  },
});

/**
 * Historique des sessions de caisse (manager/admin)
 */
export const getSessionHistory = query({
  args: {
    userId: v.optional(v.string()),
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

    // Seuls manager et admin peuvent voir l'historique complet
    if (!user || user.role === "cashier") {
      // Les caissiers ne voient que leurs propres sessions
      let sessions = await ctx.db
        .query("cashSessions")
        .withIndex("by_date")
        .order("desc")
        .collect();

      sessions = sessions.filter((s) => s.userId === identity.subject);

      if (args.limit) {
        sessions = sessions.slice(0, args.limit);
      }

      return sessions;
    }

    // Manager/Admin: accès à toutes les sessions
    let sessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_date")
      .order("desc")
      .collect();

    // Filtrer par utilisateur si spécifié
    if (args.userId) {
      sessions = sessions.filter((s) => s.userId === args.userId);
    }

    // Filtrer par dates si spécifiées
    if (args.startDate) {
      sessions = sessions.filter((s) => s.date >= args.startDate!);
    }
    if (args.endDate) {
      sessions = sessions.filter((s) => s.date <= args.endDate!);
    }

    // Limiter le nombre de résultats
    if (args.limit) {
      sessions = sessions.slice(0, args.limit);
    }

    return sessions;
  },
});

/**
 * Vérifier si une session est ouverte pour l'utilisateur
 */
export const hasOpenSession = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { hasSession: false, status: null };
    }

    const today = getTodayDateString();

    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (!session) {
      return { hasSession: false, status: null };
    }

    return { hasSession: true, status: session.status };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Ouvrir une session de caisse
 */
export const openSession = mutation({
  args: {
    openingAmount: v.number(),
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

    // Validation du montant
    if (args.openingAmount < 0) {
      throw new Error("Le montant d'ouverture ne peut pas être négatif");
    }

    const today = getTodayDateString();

    // Vérifier qu'il n'y a pas déjà une session aujourd'hui
    const existingSession = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (existingSession) {
      if (existingSession.status === "open") {
        throw new Error("Une session de caisse est déjà ouverte pour aujourd'hui");
      } else {
        throw new Error("La caisse a déjà été clôturée pour aujourd'hui");
      }
    }

    const now = Date.now();

    // Créer la session
    const sessionId = await ctx.db.insert("cashSessions", {
      userId: identity.subject,
      userName: user.name,
      date: today,
      openingAmount: args.openingAmount,
      openedAt: now,
      status: "open",
    });

    return {
      sessionId,
      openingAmount: args.openingAmount,
      openedAt: now,
    };
  },
});

/**
 * Clôturer une session de caisse
 */
export const closeSession = mutation({
  args: {
    closingAmount: v.number(),
    discrepancyReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    // Validation du montant
    if (args.closingAmount < 0) {
      throw new Error("Le montant de clôture ne peut pas être négatif");
    }

    const today = getTodayDateString();

    // Récupérer la session du jour
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (!session) {
      throw new Error("Aucune session de caisse ouverte pour aujourd'hui");
    }

    if (session.status === "closed") {
      throw new Error("La session de caisse est déjà clôturée");
    }

    // Calculer le montant attendu
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
    const mobileSales = allSales.filter((s) => s.paymentMethod === "mobile_money");
    const totalMobileSales = mobileSales.reduce((sum, s) => sum + s.total, 0);

    // Récupérer les dépenses retirées pour cette session
    const allWithdrawnExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "withdrawn"))
      .collect();

    const sessionExpenses = allWithdrawnExpenses.filter(
      (e) => e.withdrawnFromSessionId === session._id
    );
    const totalExpenses = sessionExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Montant attendu = Ouverture + Ventes espèces - Dépenses retirées
    const expectedAmount = session.openingAmount + totalCashSales - totalExpenses;
    const discrepancy = args.closingAmount - expectedAmount;

    // Vérifier la justification si écart
    if (discrepancy !== 0 && !args.discrepancyReason?.trim()) {
      throw new Error("Une justification est requise pour tout écart de caisse");
    }

    const now = Date.now();

    // Mettre à jour la session
    await ctx.db.patch(session._id, {
      closingAmount: args.closingAmount,
      closedAt: now,
      expectedAmount,
      discrepancy,
      discrepancyReason: discrepancy !== 0 ? args.discrepancyReason?.trim() : undefined,
      status: "closed",
      totalCashSales,
      totalMobileSales,
      salesCount: allSales.length,
    });

    // Vérifier si le coffre est initialisé (système de coffre actif)
    const safe = await ctx.db.query("safe").first();

    // Si le coffre existe, créer un versement en attente
    if (safe) {
      // Récupérer l'utilisateur pour le nom
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (user) {
        await ctx.db.insert("pendingDeposits", {
          cashierId: identity.subject,
          cashierName: user.name,
          sessionId: session._id,
          expectedAmount: args.closingAmount, // Le montant déclaré à la clôture
          closedAt: now,
          status: "pending",
        });
      }
    }

    return {
      sessionId: session._id,
      openingAmount: session.openingAmount,
      totalCashSales,
      totalMobileSales,
      expectedAmount,
      closingAmount: args.closingAmount,
      discrepancy,
      closedAt: now,
    };
  },
});

/**
 * Rouvrir une session de caisse clôturée
 * - Si le versement n'a pas été confirmé : rouvre la session existante
 * - Si le versement a été confirmé : supprime la session pour permettre d'en créer une nouvelle
 */
export const reopenSession = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const today = getTodayDateString();

    // Récupérer la session du jour
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (!session) {
      throw new Error("Aucune session de caisse pour aujourd'hui");
    }

    if (session.status === "open") {
      throw new Error("La session de caisse est déjà ouverte");
    }

    const now = Date.now();

    // Vérifier si le coffre est actif
    const safe = await ctx.db.query("safe").first();

    if (safe) {
      // Chercher le versement en attente pour cette session
      const pendingDeposit = await ctx.db
        .query("pendingDeposits")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .filter((q) => q.eq(q.field("sessionId"), session._id))
        .first();

      // Chercher si un versement a déjà été confirmé
      const depositedDeposit = await ctx.db
        .query("pendingDeposits")
        .filter((q) =>
          q.and(
            q.eq(q.field("sessionId"), session._id),
            q.eq(q.field("status"), "deposited")
          )
        )
        .first();

      // Supprimer le versement en attente s'il existe
      if (pendingDeposit) {
        await ctx.db.delete(pendingDeposit._id);
      }

      // Si le versement a été confirmé, on supprime la session pour permettre d'en créer une nouvelle
      // Le caissier devra redemander un fond de caisse
      if (depositedDeposit) {
        await ctx.db.delete(session._id);
        return {
          sessionId: null,
          reopenedAt: now,
          needsNewFundRequest: true, // Le caissier doit demander un nouveau fond
          message: "Session supprimée. Vous pouvez demander un nouveau fond de caisse.",
        };
      }
    }

    // Rouvrir la session en conservant le montant d'ouverture original
    await ctx.db.patch(session._id, {
      status: "open",
      closingAmount: undefined,
      closedAt: undefined,
      expectedAmount: undefined,
      discrepancy: undefined,
      discrepancyReason: undefined,
      totalCashSales: undefined,
      totalMobileSales: undefined,
      salesCount: undefined,
      reopenedAt: now,
    });

    return {
      sessionId: session._id,
      openingAmount: session.openingAmount,
      reopenedAt: now,
      needsNewFundRequest: false,
      message: "Caisse rouverte avec succès.",
    };
  },
});
