import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { writeAuditLog } from "./audit";

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
 * Récupérer la session OUVERTE d'un utilisateur, quelle que soit sa date.
 * (Une seule session ouverte par caissier — voir openSession.)
 */
async function getOpenSessionForUser(
  ctx: QueryCtx,
  userId: string
): Promise<Doc<"cashSessions"> | null> {
  // .first() (et non .unique()) comme filet de sécurité si des données héritées
  // contenaient plusieurs sessions ouvertes pour un même utilisateur.
  return await ctx.db
    .query("cashSessions")
    .withIndex("by_user_status", (q) =>
      q.eq("userId", userId).eq("status", "open")
    )
    .first();
}

/**
 * Calculer les agrégats de réconciliation d'une session, sur SON intervalle réel
 * (openedAt → closedAt/maintenant), et non sur la journée calendaire.
 */
async function computeSessionReconciliation(
  ctx: QueryCtx,
  session: Doc<"cashSessions">
) {
  const start = session.openedAt;
  const end = session.closedAt ?? Date.now();

  const allSales = await ctx.db
    .query("sales")
    .withIndex("by_date")
    .filter((q) =>
      q.and(
        q.gte(q.field("date"), start),
        q.lte(q.field("date"), end),
        q.eq(q.field("userId"), session.userId)
      )
    )
    .collect();

  const cashSales = allSales.filter((s) => s.paymentMethod === "cash");
  const totalCashSales = cashSales.reduce((sum, s) => sum + s.total, 0);
  const mobileSales = allSales.filter((s) => s.paymentMethod === "mobile_money");
  const totalMobileSales = mobileSales.reduce((sum, s) => sum + s.total, 0);
  const totalMobileChangeGiven = allSales.reduce(
    (sum, s) => sum + (s.mobileMoneyChange ?? 0),
    0
  );

  const allWithdrawnExpenses = await ctx.db
    .query("expenses")
    .withIndex("by_status", (q) => q.eq("status", "withdrawn"))
    .collect();
  const sessionExpenses = allWithdrawnExpenses.filter(
    (e) => e.withdrawnFromSessionId === session._id
  );
  const totalExpenses = sessionExpenses.reduce((sum, e) => sum + e.amount, 0);

  const sessionPayments = await ctx.db
    .query("clientPayments")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .collect();
  const totalCashRepayments = sessionPayments
    .filter((p) => p.method === "cash")
    .reduce((sum, p) => sum + p.amount, 0);

  const expectedAmount =
    session.openingAmount +
    totalCashSales +
    totalMobileChangeGiven +
    totalCashRepayments -
    totalExpenses;

  return {
    totalCashSales,
    totalMobileSales,
    totalMobileChangeGiven,
    totalCashRepayments,
    totalExpenses,
    expectedAmount,
    salesCount: allSales.length,
    cashSalesCount: cashSales.length,
    mobileSalesCount: mobileSales.length,
    expensesCount: sessionExpenses.length,
  };
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

    // Priorité à la session ouverte (persistante au-delà du jour)
    const openSession = await getOpenSessionForUser(ctx, identity.subject);
    if (openSession) {
      return openSession;
    }

    // À défaut, la session du jour (état "clôturée du jour" / versement en attente)
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

    // Récupérer la session : par ID, sinon la session ouverte de l'utilisateur (peu importe le jour)
    let session: Doc<"cashSessions"> | null;
    if (args.sessionId) {
      session = await ctx.db.get(args.sessionId);
    } else {
      session = await getOpenSessionForUser(ctx, identity.subject);
    }

    if (!session) {
      return null;
    }

    const recon = await computeSessionReconciliation(ctx, session);

    return {
      openingAmount: session.openingAmount,
      ...recon,
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

    // Une session ouverte (quel que soit le jour) prime
    const openSession = await getOpenSessionForUser(ctx, identity.subject);
    if (openSession) {
      return { hasSession: true, status: openSession.status };
    }

    // Sinon, état du jour (clôturée du jour / versement en attente)
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

    // Bloquer s'il existe déjà une session OUVERTE (quel que soit le jour) :
    // une caisse ne se ferme pas seule, elle doit être clôturée explicitement.
    const openSession = await getOpenSessionForUser(ctx, identity.subject);
    if (openSession) {
      throw new Error(
        `Une caisse est déjà ouverte depuis le ${openSession.date}. Clôturez-la avant d'en ouvrir une nouvelle.`
      );
    }

    // Empêcher de rouvrir une caisse déjà clôturée le même jour (le caissier doit utiliser "rouvrir")
    const todaySession = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) =>
        q.eq("userId", identity.subject).eq("date", today)
      )
      .unique();

    if (todaySession && todaySession.status === "closed") {
      throw new Error("La caisse a déjà été clôturée pour aujourd'hui");
    }

    const now = Date.now();

    // Le fond de caisse provient physiquement du coffre : si un coffre est initialisé,
    // l'ouverture le débite (symétrie avec approveFundRequest / confirmDeposit).
    // Sans coffre, le comportement reste strictement inchangé.
    const safe = await ctx.db.query("safe").first();
    if (safe && args.openingAmount > safe.currentBalance) {
      throw new Error("Le fond dépasse le solde du coffre");
    }

    // Créer la session
    const sessionId = await ctx.db.insert("cashSessions", {
      userId: identity.subject,
      userName: user.name,
      date: today,
      openingAmount: args.openingAmount,
      openedAt: now,
      status: "open",
    });

    // Débiter le coffre du fond remis (retrait tracé), dans la même mutation transactionnelle
    let newSafeBalance: number | undefined;
    if (safe) {
      newSafeBalance = safe.currentBalance - args.openingAmount;
      await ctx.db.patch(safe._id, {
        currentBalance: newSafeBalance,
        lastUpdated: now,
        updatedBy: identity.subject,
        updatedByName: user.name,
      });
      await ctx.db.insert("safeTransactions", {
        type: "withdrawal",
        amount: args.openingAmount,
        previousBalance: safe.currentBalance,
        newBalance: newSafeBalance,
        performedById: identity.subject,
        performedByName: user.name,
        relatedUserId: identity.subject,
        relatedUserName: user.name,
        relatedSessionId: sessionId,
        reason: `Fond de caisse (ouverture directe) — ${user.name}`,
        date: now,
      });
    }

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: user.name, role: user.role },
      action: "session.opened",
      category: "session",
      summary: `Ouverture de caisse — fond de ${args.openingAmount} FCFA`,
      targetType: "cashSession",
      targetId: sessionId,
      after: String(args.openingAmount),
    });

    return {
      sessionId,
      openingAmount: args.openingAmount,
      openedAt: now,
      newSafeBalance,
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

    // Clôturer la session OUVERTE de l'utilisateur (persistante au-delà du jour)
    const session = await getOpenSessionForUser(ctx, identity.subject);

    if (!session) {
      throw new Error("Aucune session de caisse ouverte à clôturer");
    }

    const actorUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Réconciliation sur l'intervalle réel de la session (openedAt → maintenant)
    const {
      totalCashSales,
      totalMobileSales,
      totalMobileChangeGiven,
      totalCashRepayments,
      salesCount,
      expectedAmount,
    } = await computeSessionReconciliation(ctx, session);
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
      totalMobileChangeGiven,
      totalCashRepayments,
      salesCount,
    });

    // Vérifier si le coffre est initialisé (système de coffre actif)
    const safe = await ctx.db.query("safe").first();

    // Si le coffre existe, créer un versement en attente
    if (safe && actorUser) {
      await ctx.db.insert("pendingDeposits", {
        cashierId: identity.subject,
        cashierName: actorUser.name,
        sessionId: session._id,
        expectedAmount: args.closingAmount, // Le montant déclaré à la clôture
        closedAt: now,
        status: "pending",
      });
    }

    await writeAuditLog(ctx, {
      actor: {
        id: identity.subject,
        name: actorUser?.name ?? session.userName,
        role: actorUser?.role ?? "cashier",
      },
      action: "session.closed",
      category: "session",
      summary:
        `Clôture de caisse — déclaré ${args.closingAmount} FCFA, attendu ${expectedAmount} FCFA` +
        (discrepancy !== 0 ? ` (écart ${discrepancy} FCFA)` : ""),
      targetType: "cashSession",
      targetId: session._id,
      before: String(expectedAmount),
      after: String(args.closingAmount),
      metadata:
        discrepancy !== 0
          ? `ecart=${discrepancy}; motif=${args.discrepancyReason ?? ""}`
          : undefined,
    });

    return {
      sessionId: session._id,
      openingAmount: session.openingAmount,
      totalCashSales,
      totalMobileSales,
      totalMobileChangeGiven,
      totalCashRepayments,
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

    // Récupérer la dernière session de l'utilisateur (peu importe le jour)
    const session = await ctx.db
      .query("cashSessions")
      .withIndex("by_user_date", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .first();

    if (!session) {
      throw new Error("Aucune session de caisse à rouvrir");
    }

    if (session.status === "open") {
      throw new Error("La session de caisse est déjà ouverte");
    }

    const reopenActor = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    const reopenActorInfo = {
      id: identity.subject,
      name: reopenActor?.name ?? session.userName,
      role: reopenActor?.role ?? "cashier",
    };

    const now = Date.now();

    // Vérifier si le coffre est actif
    const safe = await ctx.db.query("safe").first();

    if (safe) {
      // Une caisse clôturée signifie que l'argent (fond + recette) est rendu au coffre :
      // reprendre le travail exige un NOUVEAU fond validé par l'admin (qui redébite le coffre).

      // 1) Tant que le versement de cette caisse n'est pas confirmé, on bloque la réouverture,
      //    pour que la recette soit créditée au coffre AVANT qu'un nouveau fond n'en sorte.
      const pendingDeposit = await ctx.db
        .query("pendingDeposits")
        .withIndex("by_status", (q) => q.eq("status", "pending"))
        .filter((q) => q.eq(q.field("sessionId"), session._id))
        .first();

      if (pendingDeposit) {
        throw new Error(
          "Le versement de cette caisse doit d'abord être confirmé par un responsable avant de pouvoir la rouvrir."
        );
      }

      // 2) Versement confirmé (ou aucun) : on clôt définitivement la session et on route
      //    l'utilisateur vers une nouvelle demande de fond (caissier) / ouverture directe
      //    (admin-manager) — débit du coffre dans les deux cas. On ne supprime jamais un
      //    versement : un versement confirmé reste un historique.
      await ctx.db.delete(session._id);
      await writeAuditLog(ctx, {
        actor: reopenActorInfo,
        action: "session.reopened",
        category: "session",
        summary: `Réouverture de caisse — session ${session.date} clôturée, nouveau fond requis`,
        targetType: "cashSession",
        targetId: session._id,
      });
      return {
        sessionId: null,
        reopenedAt: now,
        needsNewFundRequest: true, // Le caissier doit demander un nouveau fond
        message: "Demandez un nouveau fond de caisse pour reprendre.",
      };
    }

    // Sans coffre : pas de notion de fond à valider — on rouvre l'ancienne session telle quelle,
    // en conservant le montant d'ouverture original.
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

    await writeAuditLog(ctx, {
      actor: reopenActorInfo,
      action: "session.reopened",
      category: "session",
      summary: `Réouverture de la caisse du ${session.date}`,
      targetType: "cashSession",
      targetId: session._id,
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
