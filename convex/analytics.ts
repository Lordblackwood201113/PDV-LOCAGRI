import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { formatClientName } from "./clients";

const DAY_MS = 86_400_000;

// ============================================
// AGRÉGATIONS (outils lecture seule pour l'assistant IA + rapports)
// Accès : admin/manager (le caissier reçoit null).
// ============================================

async function requireStaff(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user || user.role === "cashier") return null;
  return user;
}

function startTs(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getTime();
}
function endTs(dateStr: string): number {
  return new Date(dateStr + "T23:59:59.999").getTime();
}

/**
 * Chiffre d'affaires agrégé sur une période arbitraire (bornes incluses).
 */
export const getSalesSummaryByPeriod = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    productId: v.optional(v.id("products")),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return null;

    const start = startTs(args.startDate);
    const end = endTs(args.endDate);

    let sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.and(q.gte(q.field("date"), start), q.lte(q.field("date"), end)))
      .collect();
    if (args.productId) sales = sales.filter((s) => s.productId === args.productId);

    const sum = (arr: typeof sales) => arr.reduce((s, x) => s + x.total, 0);
    const cash = sales.filter((s) => s.paymentMethod === "cash");
    const mobile = sales.filter((s) => s.paymentMethod === "mobile_money");
    const credit = sales.filter((s) => s.paymentMethod === "credit");

    const dayMap = new Map<string, { amount: number; count: number }>();
    for (const s of sales) {
      const d = new Date(s.date).toISOString().split("T")[0];
      const cur = dayMap.get(d) ?? { amount: 0, count: 0 };
      cur.amount += s.total;
      cur.count += 1;
      dayMap.set(d, cur);
    }
    const byDay = Array.from(dayMap.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v2]) => ({ date, amount: v2.amount, count: v2.count }));

    return {
      period: { startDate: args.startDate, endDate: args.endDate },
      totalAmount: sum(sales),
      totalQuantity: sales.reduce((s, x) => s + x.quantity, 0),
      salesCount: sales.length,
      byMethod: {
        cash: { amount: sum(cash), count: cash.length },
        mobile_money: { amount: sum(mobile), count: mobile.length },
        credit: { amount: sum(credit), count: credit.length },
      },
      byDay,
    };
  },
});

/**
 * Classement des meilleurs produits par CA (et quantité) sur une période.
 */
export const getTopProductsBySales = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return [];

    const start = startTs(args.startDate);
    const end = endTs(args.endDate);
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.and(q.gte(q.field("date"), start), q.lte(q.field("date"), end)))
      .collect();

    const map = new Map<string, { productId: string; name: string; quantity: number; amount: number }>();
    for (const s of sales) {
      const key = s.productId ?? "legacy";
      const cur = map.get(key) ?? {
        productId: key,
        name: s.productName ?? "Produit",
        quantity: 0,
        amount: 0,
      };
      cur.quantity += s.quantity;
      cur.amount += s.total;
      map.set(key, cur);
    }
    const limit = Math.min(args.limit ?? 10, 50);
    return Array.from(map.values())
      .sort((a, b) => b.amount - a.amount || b.quantity - a.quantity)
      .slice(0, limit);
  },
});

/**
 * Total d'achats d'un client + ventilation payé/crédit/encours.
 */
export const getSalesByClient = query({
  args: {
    clientId: v.id("clients"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return null;

    let sales = await ctx.db
      .query("sales")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    if (args.startDate) {
      const s = startTs(args.startDate);
      sales = sales.filter((x) => x.date >= s);
    }
    if (args.endDate) {
      const e = endTs(args.endDate);
      sales = sales.filter((x) => x.date <= e);
    }

    const credit = sales.filter((s) => s.paymentMethod === "credit");
    const paid = sales.filter((s) => s.paymentMethod !== "credit");

    const byProduct = new Map<string, { name: string; quantity: number; amount: number }>();
    for (const s of sales) {
      const key = s.productId ?? "legacy";
      const cur = byProduct.get(key) ?? { name: s.productName ?? "Produit", quantity: 0, amount: 0 };
      cur.quantity += s.quantity;
      cur.amount += s.total;
      byProduct.set(key, cur);
    }

    return {
      totalAmount: sales.reduce((s, x) => s + x.total, 0),
      purchaseCount: sales.length,
      totalQuantity: sales.reduce((s, x) => s + x.quantity, 0),
      paidAmount: paid.reduce((s, x) => s + x.total, 0),
      creditAmount: credit.reduce((s, x) => s + x.total, 0),
      outstandingAmount: credit.reduce((s, x) => s + (x.amountDue ?? x.total), 0),
      byProduct: Array.from(byProduct.values()).sort((a, b) => b.amount - a.amount),
    };
  },
});

/**
 * Rapport des écarts de caisse (sessions clôturées avec écart) sur une période.
 */
export const getCashDiscrepancyReport = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return null;

    let sessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_date")
      .order("desc")
      .collect();
    sessions = sessions.filter((s) => s.status === "closed");
    // cashSessions.date est "YYYY-MM-DD" → comparaison lexicographique OK
    if (args.startDate) sessions = sessions.filter((s) => s.date >= args.startDate!);
    if (args.endDate) sessions = sessions.filter((s) => s.date <= args.endDate!);
    if (args.userId) sessions = sessions.filter((s) => s.userId === args.userId);

    const withDisc = sessions.filter((s) => (s.discrepancy ?? 0) !== 0);

    const byCashier = new Map<
      string,
      { userId: string; userName: string; sessionsCount: number; totalDiscrepancy: number; maxAbsDiscrepancy: number }
    >();
    for (const s of withDisc) {
      const d = s.discrepancy ?? 0;
      const cur = byCashier.get(s.userId) ?? {
        userId: s.userId,
        userName: s.userName,
        sessionsCount: 0,
        totalDiscrepancy: 0,
        maxAbsDiscrepancy: 0,
      };
      cur.sessionsCount += 1;
      cur.totalDiscrepancy += d;
      cur.maxAbsDiscrepancy = Math.max(cur.maxAbsDiscrepancy, Math.abs(d));
      byCashier.set(s.userId, cur);
    }

    return {
      totalDiscrepancy: withDisc.reduce((sum, s) => sum + (s.discrepancy ?? 0), 0),
      sessionsWithDiscrepancyCount: withDisc.length,
      totalSessions: sessions.length,
      byCashier: Array.from(byCashier.values()),
      sessions: withDisc.slice(0, 100).map((s) => ({
        date: s.date,
        userName: s.userName,
        closingAmount: s.closingAmount,
        expectedAmount: s.expectedAmount,
        discrepancy: s.discrepancy,
        discrepancyReason: s.discrepancyReason,
      })),
    };
  },
});

/**
 * Total et détail des dépenses sur une période (par catégorie et statut).
 */
export const getExpensesSummaryByPeriod = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    category: v.optional(
      v.union(
        v.literal("fournitures"),
        v.literal("transport"),
        v.literal("maintenance"),
        v.literal("autre")
      )
    ),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("withdrawn")
      )
    ),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return null;

    let expenses = await ctx.db
      .query("expenses")
      .withIndex("by_date")
      .order("desc")
      .collect();
    if (args.startDate) {
      const s = startTs(args.startDate);
      expenses = expenses.filter((e) => e.date >= s);
    }
    if (args.endDate) {
      const e2 = endTs(args.endDate);
      expenses = expenses.filter((e) => e.date <= e2);
    }
    if (args.category) expenses = expenses.filter((e) => e.category === args.category);
    if (args.status) expenses = expenses.filter((e) => e.status === args.status);

    const byCategory = new Map<string, { category: string; total: number; count: number }>();
    const byStatus = new Map<string, { status: string; total: number; count: number }>();
    for (const e of expenses) {
      const c = byCategory.get(e.category) ?? { category: e.category, total: 0, count: 0 };
      c.total += e.amount;
      c.count += 1;
      byCategory.set(e.category, c);
      const st = byStatus.get(e.status) ?? { status: e.status, total: 0, count: 0 };
      st.total += e.amount;
      st.count += 1;
      byStatus.set(e.status, st);
    }

    return {
      total: expenses.reduce((s, e) => s + e.amount, 0),
      count: expenses.length,
      byCategory: Array.from(byCategory.values()),
      byStatus: Array.from(byStatus.values()),
    };
  },
});

/**
 * Point consolidé de la journée (pour "fais-moi le point").
 */
export const getBusinessDashboard = query({
  args: { date: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return null;

    const dayStr = args.date ?? new Date().toISOString().split("T")[0];
    const start = startTs(dayStr);
    const end = endTs(dayStr);

    // Ventes du jour
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_date")
      .filter((q) => q.and(q.gte(q.field("date"), start), q.lte(q.field("date"), end)))
      .collect();
    const sum = (arr: typeof sales) => arr.reduce((s, x) => s + x.total, 0);
    const cash = sales.filter((s) => s.paymentMethod === "cash");
    const mobile = sales.filter((s) => s.paymentMethod === "mobile_money");
    const credit = sales.filter((s) => s.paymentMethod === "credit");

    // Coffre
    const safe = await ctx.db.query("safe").first();

    // Créances
    const activeClients = await ctx.db
      .query("clients")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    const debtors = activeClients.filter((c) => (c.balance ?? 0) > 0);

    // Stock bas
    const products = (await ctx.db.query("products").collect()).filter(
      (p) => p.isActive !== false
    );
    const lowStock = products.filter((p) => p.stockQuantity <= p.alertThreshold);

    // Sessions ouvertes
    const openSessions = await ctx.db
      .query("cashSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    // En attente
    const pendingFund = await ctx.db
      .query("cashFundRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const pendingDep = await ctx.db
      .query("pendingDeposits")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    const pendingExp = await ctx.db
      .query("expenses")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return {
      date: dayStr,
      day: {
        salesAmount: sum(sales),
        salesCount: sales.length,
        byMethod: {
          cash: sum(cash),
          mobile_money: sum(mobile),
          credit: sum(credit),
        },
      },
      safeBalance: safe?.currentBalance ?? null,
      openSessionsCount: openSessions.length,
      receivables: {
        total: debtors.reduce((s, c) => s + (c.balance ?? 0), 0),
        debtorCount: debtors.length,
      },
      lowStock: {
        count: lowStock.length,
        items: lowStock.slice(0, 20).map((p) => ({
          name: p.name,
          stock: p.stockQuantity,
          threshold: p.alertThreshold,
          unit: p.unit ?? "sac",
        })),
      },
      pending: {
        fundRequests: pendingFund.length,
        deposits: pendingDep.length,
        expenses: pendingExp.length,
      },
    };
  },
});

// ============================================
// INTELLIGENCE CLIENTS (story 1.7) — outils lecture seule pour l'assistant IA
// Segmentations simples (nouveaux / inactifs / meilleurs / débiteurs âgés) ;
// le modèle raisonne dessus pour recommandations & relances. Admin/manager.
// ============================================

/**
 * Clients récents / NOUVEAUX clients sur une fenêtre de création (ou tous, bornés),
 * triés du plus récent au plus ancien et enrichis de l'activité d'achat.
 * Dates en AAAA-MM-JJ (comme les autres agrégations) ; `days` = N derniers jours.
 */
export const getRecentClients = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    days: v.optional(v.number()),
    type: v.optional(v.union(v.literal("particulier"), v.literal("grossiste"))),
    includeInactive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return [];

    let clients = await ctx.db.query("clients").collect();
    if (!args.includeInactive) clients = clients.filter((c) => c.isActive);
    if (args.type) clients = clients.filter((c) => (c.type ?? "particulier") === args.type);

    // Fenêtre de création : bornes explicites (startDate/endDate) OU N derniers jours.
    // `days` est EXCLUSIF des bornes : il n'agit que si AUCUNE borne valide n'est posée
    // (sinon `days` ancré sur "maintenant" pourrait inverser la fenêtre → liste vide).
    // Date malformée → bornée ignorée (pas de NaN qui viderait silencieusement la liste).
    let from: number | undefined;
    let to: number | undefined;
    if (args.startDate) {
      const t = startTs(args.startDate);
      if (!Number.isNaN(t)) from = t;
    }
    if (args.endDate) {
      const t = endTs(args.endDate);
      if (!Number.isNaN(t)) to = t;
    }
    if (from === undefined && to === undefined && args.days && args.days > 0) {
      from = Date.now() - args.days * DAY_MS;
    }
    if (from !== undefined) clients = clients.filter((c) => c.createdAt >= from!);
    if (to !== undefined) clients = clients.filter((c) => c.createdAt <= to!);

    clients.sort((a, b) => b.createdAt - a.createdAt);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const top = clients.slice(0, limit);

    // Enrichir uniquement le sous-ensemble retenu (lectures by_client ciblées)
    return await Promise.all(
      top.map(async (c) => {
        const sales = await ctx.db
          .query("sales")
          .withIndex("by_client", (q) => q.eq("clientId", c._id))
          .collect();
        const lastPurchaseAt = sales.reduce<number | null>(
          (max, s) => (max === null || s.date > max ? s.date : max),
          null
        );
        return {
          _id: c._id,
          reference: c.reference,
          displayName: formatClientName(c.firstName, c.lastName, c.reference),
          phone: c.phone ?? null,
          quartier: c.quartier ?? null,
          type: c.type ?? "particulier",
          isActive: c.isActive,
          createdAt: c.createdAt,
          createdByName: c.createdByName,
          balance: c.balance ?? 0,
          purchaseCount: sales.length,
          lastPurchaseAt,
          totalPurchased: sales.reduce((sum, s) => sum + s.total, 0),
        };
      })
    );
  },
});

/**
 * Clients ACTIFS sans achat depuis `days` jours (défaut 30) — relances d'inactivité.
 * Inclut par défaut ceux qui n'ont jamais acheté. Triés du plus inactif au moins inactif.
 */
export const getInactiveClients = query({
  args: {
    days: v.optional(v.number()),
    type: v.optional(v.union(v.literal("particulier"), v.literal("grossiste"))),
    includeNeverPurchased: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return [];

    const days = args.days && args.days > 0 ? args.days : 30;
    const includeNever = args.includeNeverPurchased ?? true;

    // Un seul passage sur les ventes → dernier achat + nb achats par client
    const lastPurchase = new Map<string, number>();
    const purchaseCount = new Map<string, number>();
    for (const s of await ctx.db.query("sales").collect()) {
      if (!s.clientId) continue;
      const k = s.clientId as string;
      const prev = lastPurchase.get(k);
      if (prev === undefined || s.date > prev) lastPurchase.set(k, s.date);
      purchaseCount.set(k, (purchaseCount.get(k) ?? 0) + 1);
    }

    let clients = await ctx.db
      .query("clients")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    if (args.type) clients = clients.filter((c) => (c.type ?? "particulier") === args.type);

    const now = Date.now();
    const rows = clients
      .map((c) => {
        const last = lastPurchase.get(c._id) ?? null;
        return {
          _id: c._id,
          reference: c.reference,
          displayName: formatClientName(c.firstName, c.lastName, c.reference),
          phone: c.phone ?? null,
          quartier: c.quartier ?? null,
          type: c.type ?? "particulier",
          balance: c.balance ?? 0,
          purchaseCount: purchaseCount.get(c._id) ?? 0,
          lastPurchaseAt: last,
          daysSinceLastPurchase: last === null ? null : Math.floor((now - last) / DAY_MS),
        };
      })
      // Filtre dérivé de la MÊME valeur que la colonne affichée/exportée
      // (daysSinceLastPurchase floorée) → pas de divergence d'un jour au bord.
      // « inactif depuis au moins `days` jours » (cohérent avec le titre « ≥ days j »).
      .filter((r) =>
        r.daysSinceLastPurchase === null ? includeNever : r.daysSinceLastPurchase >= days
      )
      .sort((a, b) => {
        // jamais acheté en tête, sinon le plus ancien dernier achat d'abord
        if (a.lastPurchaseAt === null && b.lastPurchaseAt === null) return 0;
        if (a.lastPurchaseAt === null) return -1;
        if (b.lastPurchaseAt === null) return 1;
        return a.lastPurchaseAt - b.lastPurchaseAt;
      });

    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    return rows.slice(0, limit);
  },
});

/**
 * Meilleurs clients par MONTANT acheté sur une période (base des recommandations).
 * Ignore les ventes anonymes (sans clientId).
 */
export const getTopClients = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx))) return [];

    let sales;
    if (args.startDate || args.endDate) {
      // Date malformée → borne ouverte (0 / +∞) plutôt que NaN (qui ne matcherait rien).
      const s = args.startDate ? startTs(args.startDate) : NaN;
      const e = args.endDate ? endTs(args.endDate) : NaN;
      const start = Number.isNaN(s) ? 0 : s;
      const end = Number.isNaN(e) ? Number.MAX_SAFE_INTEGER : e;
      sales = await ctx.db
        .query("sales")
        .withIndex("by_date")
        .filter((q) => q.and(q.gte(q.field("date"), start), q.lte(q.field("date"), end)))
        .collect();
    } else {
      sales = await ctx.db.query("sales").collect();
    }

    const map = new Map<
      string,
      {
        clientId: string;
        totalAmount: number;
        purchaseCount: number;
        totalQuantity: number;
        lastPurchaseAt: number;
        byProduct: Map<string, { name: string; quantity: number; amount: number }>;
      }
    >();
    for (const s of sales) {
      if (!s.clientId) continue;
      const k = s.clientId as string;
      const cur =
        map.get(k) ??
        {
          clientId: k,
          totalAmount: 0,
          purchaseCount: 0,
          totalQuantity: 0,
          lastPurchaseAt: 0,
          byProduct: new Map<string, { name: string; quantity: number; amount: number }>(),
        };
      cur.totalAmount += s.total;
      cur.purchaseCount += 1;
      cur.totalQuantity += s.quantity;
      if (s.date > cur.lastPurchaseAt) cur.lastPurchaseAt = s.date;
      const pk = (s.productId ?? "legacy") as string;
      const p = cur.byProduct.get(pk) ?? { name: s.productName ?? "Produit", quantity: 0, amount: 0 };
      p.quantity += s.quantity;
      p.amount += s.total;
      cur.byProduct.set(pk, p);
      map.set(k, cur);
    }

    const limit = Math.min(Math.max(args.limit ?? 10, 1), 100);
    const sorted = Array.from(map.values())
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit);

    return await Promise.all(
      sorted.map(async (agg) => {
        const c = await ctx.db.get(agg.clientId as Id<"clients">);
        return {
          _id: agg.clientId,
          reference: c?.reference ?? "-",
          displayName: c ? formatClientName(c.firstName, c.lastName, c.reference) : "Client inconnu",
          phone: c?.phone ?? null,
          type: c?.type ?? "particulier",
          balance: c?.balance ?? 0,
          totalAmount: agg.totalAmount,
          purchaseCount: agg.purchaseCount,
          totalQuantity: agg.totalQuantity,
          lastPurchaseAt: agg.lastPurchaseAt,
          byProduct: Array.from(agg.byProduct.values()).sort((a, b) => b.amount - a.amount),
        };
      })
    );
  },
});

/**
 * Débiteurs à relancer AVEC ancienneté de la dette (jours depuis la plus ancienne
 * vente à crédit impayée). Distinct de getReceivables (qui trie par montant) → aucune
 * régression de l'outil/export existant. Trié par ancienneté décroissante.
 */
export const getReceivablesAging = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!(await requireStaff(ctx)))
      return { clients: [], totalOutstanding: 0, debtorCount: 0 };

    const activeClients = await ctx.db
      .query("clients")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();
    const debtors = activeClients.filter((c) => (c.balance ?? 0) > 0);

    const now = Date.now();
    const rows = await Promise.all(
      debtors.map(async (c) => {
        const sales = await ctx.db
          .query("sales")
          .withIndex("by_client", (q) => q.eq("clientId", c._id))
          .collect();
        const unpaid = sales.filter(
          (s) => s.paymentMethod === "credit" && (s.paymentStatus ?? "unpaid") === "unpaid"
        );
        const oldestUnpaidDate = unpaid.reduce<number | null>(
          (min, s) => (min === null || s.date < min ? s.date : min),
          null
        );
        return {
          _id: c._id,
          reference: c.reference,
          displayName: formatClientName(c.firstName, c.lastName, c.reference),
          phone: c.phone ?? null,
          quartier: c.quartier ?? null,
          type: c.type ?? "particulier",
          balance: c.balance ?? 0,
          oldestUnpaidDate,
          daysOverdue:
            oldestUnpaidDate === null ? 0 : Math.floor((now - oldestUnpaidDate) / DAY_MS),
          unpaidSalesCount: unpaid.length,
        };
      })
    );
    rows.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);

    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);
    return {
      clients: rows.slice(0, limit),
      totalOutstanding: rows.reduce((s, c) => s + c.balance, 0),
      debtorCount: rows.length,
    };
  },
});
