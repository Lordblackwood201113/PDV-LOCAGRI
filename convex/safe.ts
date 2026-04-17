import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// QUERIES
// ============================================

/**
 * Récupérer l'état actuel du coffre (admin/manager only pour les détails)
 */
export const getSafeStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Seuls admin et manager peuvent voir le coffre avec les détails
    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return null;
    }

    const safe = await ctx.db.query("safe").first();
    return safe;
  },
});

/**
 * Vérifier si le coffre est initialisé (pour tous les utilisateurs)
 * Utilisé pour savoir si le workflow de demande de fond doit être activé
 */
export const isSafeInitialized = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }

    const safe = await ctx.db.query("safe").first();
    return safe !== null;
  },
});

/**
 * Historique des transactions du coffre
 */
export const getTransactionHistory = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(v.union(
      v.literal("initial"),
      v.literal("withdrawal"),
      v.literal("deposit"),
      v.literal("adjustment")
    )),
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

    let transactions;
    if (args.type) {
      transactions = await ctx.db
        .query("safeTransactions")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .order("desc")
        .collect();
    } else {
      transactions = await ctx.db
        .query("safeTransactions")
        .withIndex("by_date")
        .order("desc")
        .collect();
    }

    if (args.limit) {
      transactions = transactions.slice(0, args.limit);
    }

    return transactions;
  },
});

/**
 * Demandes de fond de caisse en attente
 */
export const getPendingFundRequests = query({
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return [];
    }

    const requests = await ctx.db
      .query("cashFundRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    return requests;
  },
});

/**
 * Compter les demandes de fond en attente (pour badge)
 */
export const getPendingFundRequestsCount = query({
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return 0;
    }

    const requests = await ctx.db
      .query("cashFundRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return requests.length;
  },
});

/**
 * Versements en attente
 */
export const getPendingDeposits = query({
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return [];
    }

    const deposits = await ctx.db
      .query("pendingDeposits")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    return deposits;
  },
});

/**
 * Compter les versements en attente (pour badge)
 */
export const getPendingDepositsCount = query({
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      return 0;
    }

    const deposits = await ctx.db
      .query("pendingDeposits")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return deposits.length;
  },
});

/**
 * Vérifier si le caissier a une demande de fond en cours ou approuvée aujourd'hui
 */
export const getMyFundRequest = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const today = new Date().toISOString().split("T")[0];
    const startOfDay = new Date(today + "T00:00:00").getTime();

    const request = await ctx.db
      .query("cashFundRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", identity.subject))
      .order("desc")
      .first();

    // Retourner si en attente OU approuvée aujourd'hui
    if (request) {
      if (request.status === "pending") {
        return request;
      }
      // Si approuvée aujourd'hui, retourner aussi pour afficher le montant
      if (request.status === "approved" && request.approvedAt && request.approvedAt >= startOfDay) {
        return {
          ...request,
          amount: request.amountGiven,
        };
      }
    }

    return null;
  },
});

/**
 * Vérifier si le caissier a un versement en attente
 */
export const getMyPendingDeposit = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const deposit = await ctx.db
      .query("pendingDeposits")
      .withIndex("by_cashier", (q) => q.eq("cashierId", identity.subject))
      .order("desc")
      .first();

    if (deposit && deposit.status === "pending") {
      return deposit;
    }

    return null;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Initialiser le coffre (admin uniquement, une seule fois)
 */
export const initializeSafe = mutation({
  args: {
    initialBalance: v.number(),
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
      throw new Error("Seul un administrateur peut initialiser le coffre");
    }

    // Vérifier si le coffre existe déjà
    const existingSafe = await ctx.db.query("safe").first();
    if (existingSafe) {
      throw new Error("Le coffre est déjà initialisé");
    }

    if (args.initialBalance < 0) {
      throw new Error("Le solde initial ne peut pas être négatif");
    }

    const now = Date.now();

    // Créer le coffre
    const safeId = await ctx.db.insert("safe", {
      currentBalance: args.initialBalance,
      lastUpdated: now,
      updatedBy: identity.subject,
      updatedByName: user.name,
    });

    // Enregistrer la transaction initiale
    await ctx.db.insert("safeTransactions", {
      type: "initial",
      amount: args.initialBalance,
      previousBalance: 0,
      newBalance: args.initialBalance,
      performedById: identity.subject,
      performedByName: user.name,
      reason: "Solde initial du coffre",
      date: now,
    });

    return { safeId, balance: args.initialBalance };
  },
});

/**
 * Faire un ajustement manuel du coffre (admin uniquement)
 */
export const adjustSafe = mutation({
  args: {
    amount: v.number(),
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

    if (!user || user.role !== "admin") {
      throw new Error("Seul un administrateur peut ajuster le coffre");
    }

    const safe = await ctx.db.query("safe").first();
    if (!safe) {
      throw new Error("Le coffre n'est pas initialisé");
    }

    if (!args.reason.trim()) {
      throw new Error("Le motif est requis pour un ajustement");
    }

    const now = Date.now();
    const newBalance = safe.currentBalance + args.amount;

    if (newBalance < 0) {
      throw new Error("L'ajustement rendrait le solde négatif");
    }

    // Mettre à jour le coffre
    await ctx.db.patch(safe._id, {
      currentBalance: newBalance,
      lastUpdated: now,
      updatedBy: identity.subject,
      updatedByName: user.name,
    });

    // Enregistrer la transaction
    await ctx.db.insert("safeTransactions", {
      type: "adjustment",
      amount: args.amount,
      previousBalance: safe.currentBalance,
      newBalance,
      performedById: identity.subject,
      performedByName: user.name,
      reason: args.reason.trim(),
      date: now,
    });

    return { previousBalance: safe.currentBalance, newBalance };
  },
});

/**
 * Caissier demande un fond de caisse
 */
export const requestCashFund = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || !user.isActive) {
      throw new Error("Utilisateur non trouvé ou désactivé");
    }

    if (user.role === "pending") {
      throw new Error("Votre compte est en attente de validation");
    }

    // Vérifier qu'il n'a pas déjà une demande en cours
    const existingRequest = await ctx.db
      .query("cashFundRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", identity.subject))
      .order("desc")
      .first();

    if (existingRequest && existingRequest.status === "pending") {
      throw new Error("Vous avez déjà une demande de fond de caisse en cours");
    }

    // Vérifier qu'il n'a pas déjà une session ouverte aujourd'hui
    const today = new Date().toISOString().split("T")[0];
    const existingSession = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (existingSession) {
      if (existingSession.status === "open") {
        throw new Error("Vous avez déjà une caisse ouverte");
      } else {
        throw new Error("Votre caisse a déjà été clôturée pour aujourd'hui");
      }
    }

    const now = Date.now();

    const requestId = await ctx.db.insert("cashFundRequests", {
      requesterId: identity.subject,
      requesterName: user.name,
      status: "pending",
      requestedAt: now,
    });

    return { requestId };
  },
});

/**
 * Admin/Manager approuve une demande de fond de caisse
 */
export const approveFundRequest = mutation({
  args: {
    requestId: v.id("cashFundRequests"),
    amount: v.number(),
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Seuls les administrateurs et managers peuvent approuver");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Demande non trouvée");
    }

    if (request.status !== "pending") {
      throw new Error("Cette demande n'est plus en attente");
    }

    if (args.amount <= 0) {
      throw new Error("Le montant doit être supérieur à 0");
    }

    // Vérifier le coffre
    const safe = await ctx.db.query("safe").first();
    if (!safe) {
      throw new Error("Le coffre n'est pas initialisé");
    }

    // Alerte si solde insuffisant (mais on autorise quand même)
    const isLowBalance = safe.currentBalance < args.amount;

    const now = Date.now();
    const today = new Date().toISOString().split("T")[0];
    const newSafeBalance = safe.currentBalance - args.amount;

    // Créer la session de caisse pour le caissier
    const sessionId = await ctx.db.insert("cashSessions", {
      userId: request.requesterId,
      userName: request.requesterName,
      date: today,
      openingAmount: args.amount,
      openedAt: now,
      status: "open",
    });

    // Mettre à jour le coffre
    await ctx.db.patch(safe._id, {
      currentBalance: newSafeBalance,
      lastUpdated: now,
      updatedBy: identity.subject,
      updatedByName: user.name,
    });

    // Enregistrer la transaction coffre
    await ctx.db.insert("safeTransactions", {
      type: "withdrawal",
      amount: args.amount,
      previousBalance: safe.currentBalance,
      newBalance: newSafeBalance,
      performedById: identity.subject,
      performedByName: user.name,
      relatedUserId: request.requesterId,
      relatedUserName: request.requesterName,
      relatedSessionId: sessionId,
      reason: `Fond de caisse pour ${request.requesterName}`,
      date: now,
    });

    // Mettre à jour la demande
    await ctx.db.patch(args.requestId, {
      status: "approved",
      approvedById: identity.subject,
      approvedByName: user.name,
      approvedAt: now,
      amountGiven: args.amount,
      sessionId,
    });

    return {
      sessionId,
      amount: args.amount,
      cashierName: request.requesterName,
      newSafeBalance,
      isLowBalance,
    };
  },
});

/**
 * Admin/Manager rejette une demande de fond de caisse
 */
export const rejectFundRequest = mutation({
  args: {
    requestId: v.id("cashFundRequests"),
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Seuls les administrateurs et managers peuvent rejeter");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Demande non trouvée");
    }

    if (request.status !== "pending") {
      throw new Error("Cette demande n'est plus en attente");
    }

    if (!args.reason.trim()) {
      throw new Error("Le motif de rejet est requis");
    }

    await ctx.db.patch(args.requestId, {
      status: "rejected",
      approvedById: identity.subject,
      approvedByName: user.name,
      approvedAt: Date.now(),
      rejectionReason: args.reason.trim(),
    });

    return { rejected: true };
  },
});

/**
 * Annuler sa propre demande de fond de caisse
 */
export const cancelFundRequest = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const request = await ctx.db
      .query("cashFundRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", identity.subject))
      .order("desc")
      .first();

    if (!request || request.status !== "pending") {
      throw new Error("Aucune demande en cours à annuler");
    }

    await ctx.db.delete(request._id);

    return { cancelled: true };
  },
});

/**
 * Créer un versement en attente (appelé automatiquement à la clôture de caisse)
 */
export const createPendingDeposit = mutation({
  args: {
    sessionId: v.id("cashSessions"),
    expectedAmount: v.number(),
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

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session non trouvée");
    }

    // Vérifier que c'est bien la session de l'utilisateur
    if (session.userId !== identity.subject) {
      throw new Error("Cette session ne vous appartient pas");
    }

    const now = Date.now();

    const depositId = await ctx.db.insert("pendingDeposits", {
      cashierId: identity.subject,
      cashierName: user.name,
      sessionId: args.sessionId,
      expectedAmount: args.expectedAmount,
      closedAt: now,
      status: "pending",
    });

    return { depositId };
  },
});

/**
 * Admin/Manager confirme un versement au coffre
 */
export const confirmDeposit = mutation({
  args: {
    depositId: v.id("pendingDeposits"),
    actualAmount: v.number(),
    discrepancyNote: v.optional(v.string()),
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

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
      throw new Error("Seuls les administrateurs et managers peuvent confirmer un versement");
    }

    const deposit = await ctx.db.get(args.depositId);
    if (!deposit) {
      throw new Error("Versement non trouvé");
    }

    if (deposit.status !== "pending") {
      throw new Error("Ce versement a déjà été traité");
    }

    if (args.actualAmount < 0) {
      throw new Error("Le montant ne peut pas être négatif");
    }

    // Vérifier si écart et note requise
    const hasDiscrepancy = args.actualAmount !== deposit.expectedAmount;
    if (hasDiscrepancy && !args.discrepancyNote?.trim()) {
      throw new Error("Une note explicative est requise en cas d'écart");
    }

    // Mettre à jour le coffre
    const safe = await ctx.db.query("safe").first();
    if (!safe) {
      throw new Error("Le coffre n'est pas initialisé");
    }

    const now = Date.now();
    const newSafeBalance = safe.currentBalance + args.actualAmount;

    await ctx.db.patch(safe._id, {
      currentBalance: newSafeBalance,
      lastUpdated: now,
      updatedBy: identity.subject,
      updatedByName: user.name,
    });

    // Enregistrer la transaction coffre
    await ctx.db.insert("safeTransactions", {
      type: "deposit",
      amount: args.actualAmount,
      previousBalance: safe.currentBalance,
      newBalance: newSafeBalance,
      performedById: identity.subject,
      performedByName: user.name,
      relatedUserId: deposit.cashierId,
      relatedUserName: deposit.cashierName,
      relatedSessionId: deposit.sessionId,
      reason: hasDiscrepancy
        ? `Versement ${deposit.cashierName} (écart: ${args.discrepancyNote})`
        : `Versement ${deposit.cashierName}`,
      date: now,
    });

    // Mettre à jour le versement
    await ctx.db.patch(args.depositId, {
      status: "deposited",
      depositedById: identity.subject,
      depositedByName: user.name,
      depositedAt: now,
      actualAmount: args.actualAmount,
      discrepancyNote: hasDiscrepancy ? args.discrepancyNote?.trim() : undefined,
    });

    return {
      newSafeBalance,
      amountDeposited: args.actualAmount,
      hasDiscrepancy,
    };
  },
});
