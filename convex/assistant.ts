import { v } from "convex/values";
import { action, query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ============================================
// ASSISTANT IA (DeepSeek) — admin uniquement, LECTURE SEULE
// ============================================

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat"; // déprécié ~2026-07-24 → surchargeable via DEEPSEEK_MODEL
const MAX_ITERATIONS = 6;
const MAX_TOOL_RESULT_CHARS = 12000;
// Plafond des exports de listes clients (= max des queries). Gardé IDENTIQUE côté
// front (src/lib/assistantExports.ts) pour que le comptage serveur et le fichier
// fabriqué couvrent exactement le même ensemble de lignes.
const CLIENT_EXPORT_LIMIT = 200;
const TOP_CLIENTS_EXPORT_LIMIT = 100;

const SYSTEM_PROMPT = `Tu es l'assistant de gestion de LOCAGRI, un point de vente de produits agricoles. Tu réponds à l'ADMINISTRATEUR, en français, de façon concise et factuelle.
RÈGLE ABSOLUE : tu ne réponds QUE sur la base des données renvoyées par tes outils. Tu n'inventes JAMAIS un chiffre, un nom, un solde ni une date. Si aucun outil ne fournit l'information, réponds exactement : "Je ne sais pas, cette information n'est pas disponible dans les données."
Pour toute question chiffrée (CA, stock, créances, dépenses, écarts), appelle l'outil correspondant et cite la période couverte. Ne te fie pas à ta mémoire.
Monnaie : toujours en FCFA, nombres entiers, séparateur de milliers (ex. 1 250 000 FCFA). Dates : convertis "ce mois", "hier", "la semaine dernière" en bornes AAAA-MM-JJ à partir de la date du jour fournie.
Pour un client cité par son nom : appelle d'abord search_clients, puis get_client_detail. Pour une synthèse ("fais le point") : get_business_dashboard.
Tu disposes d'outils couvrant TOUTES les données de la boutique : ventes (résumé get_sales_summary, détail get_sales_detail, top get_top_products), stock (get_low_stock, get_stock_movements, catalogue list_products), créances (get_receivables, get_client_detail), coffre (get_safe_status, get_safe_transactions), dépenses (get_expenses_summary, get_expenses_detail), caisse (get_cash_discrepancy_report, get_cash_sessions), équipe (list_team), opérations en attente (get_pending_operations) et journal d'audit (get_audit_logs).
CLIENTS & RELANCES : pour LISTER ou SEGMENTER les clients, utilise list_clients (filtre les NOUVEAUX clients par période de création et par type particulier/grossiste). Pour préparer des RELANCES : get_inactive_clients (clients sans achat récent à réactiver) et get_credit_relances (débiteurs triés par ANCIENNETÉ de la dette). Pour repérer les MEILLEURS clients et bâtir une recommandation, get_top_clients, puis get_client_detail pour voir ce qu'un client achète. RELANCES = LECTURE SEULE : tu PRÉPARES la liste des clients à contacter (avec téléphone) et tu peux PROPOSER un message type, mais tu N'ENVOIES aucun SMS/appel/message et tu ne crées/modifies AUCUN client ; pour contacter quelqu'un, indique l'écran Clients ou le téléphone affiché. Pour une liste imprimable, utilise prepare_export (new_clients, inactive_clients, top_clients).
EXPORTS : si l'admin demande d'exporter, télécharger ou générer un fichier (PDF/Excel), appelle prepare_export avec le bon report et format, puis confirme en une phrase que le fichier est prêt (titre + nombre de lignes). N'écris jamais toi-même le contenu d'un tableau d'export.
FORMATAGE : structure tes réponses en Markdown léger — **gras** pour les chiffres clés, listes à puces pour les énumérations, et tableaux Markdown quand tu compares plusieurs lignes. Reste concis.
Tu as un accès LECTURE SEULE : tu ne peux RIEN modifier, valider, approuver, supprimer ni créer. Si on te le demande, explique que tu es en lecture seule et indique l'écran de l'application à utiliser.
Réponds de façon concise (le chiffre clé en premier). Si un outil renvoie une liste vide ou null, dis qu'il n'y a pas de données pour ce critère.`;

// --------------------------------------------
// Types DeepSeek (compatible OpenAI)
// --------------------------------------------
interface ToolCall {
  id: string;
  type: string;
  function: { name: string; arguments: string };
}
interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}
interface DeepSeekMessage {
  role: string;
  content: string | null;
  tool_calls?: ToolCall[];
}
interface DeepSeekChoice {
  finish_reason: string;
  message: DeepSeekMessage;
}
interface DeepSeekResponse {
  choices?: DeepSeekChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

// --------------------------------------------
// Registre d'outils LECTURE SEULE
// --------------------------------------------
type ToolArgs = Record<string, unknown>;
interface AssistantTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (ctx: ActionCtx, args: ToolArgs) => Promise<unknown>;
}

function str(v: unknown): string | undefined {
  return v === undefined || v === null ? undefined : String(v);
}
function toMs(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00").getTime();
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
// Fin de journée inclusive (pour les bornes endDate exprimées en AAAA-MM-JJ).
function toMsEnd(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === "number") return v;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T23:59:59.999").getTime();
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
function num(v: unknown, max?: number): number | undefined {
  // Accepte aussi un nombre passé en chaîne par le modèle ; ignore les valeurs
  // non finies ou <= 0 (l'appelant retombe alors sur sa valeur par défaut).
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return max ? Math.min(n, max) : n;
}

const TOOLS: AssistantTool[] = [
  {
    name: "get_business_dashboard",
    description:
      "Point consolidé d'une journée : CA et ventilation espèces/mobile/crédit, solde du coffre, total des créances, produits sous le seuil, demandes/versements/dépenses en attente. Pour 'fais-moi le point'.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "AAAA-MM-JJ optionnel, défaut aujourd'hui" } },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) => ctx.runQuery(api.analytics.getBusinessDashboard, { date: str(a.date) }),
  },
  {
    name: "get_sales_summary",
    description:
      "Chiffre d'affaires agrégé sur une période : total, quantité, ventilation cash/mobile_money/credit, et série jour par jour.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "AAAA-MM-JJ inclus" },
        endDate: { type: "string", description: "AAAA-MM-JJ inclus" },
      },
      required: ["startDate", "endDate"],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getSalesSummaryByPeriod, {
        startDate: String(a.startDate),
        endDate: String(a.endDate),
      }),
  },
  {
    name: "get_top_products",
    description: "Meilleurs produits par CA et quantité sur une période.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string" },
        endDate: { type: "string" },
        limit: { type: "integer", description: "défaut 10, max 50" },
      },
      required: ["startDate", "endDate"],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getTopProductsBySales, {
        startDate: String(a.startDate),
        endDate: String(a.endDate),
        limit: typeof a.limit === "number" ? a.limit : undefined,
      }),
  },
  {
    name: "get_receivables",
    description: "État des créances clients : total des encours, nombre de débiteurs et liste par solde décroissant.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: (ctx) => ctx.runQuery(api.clients.getReceivables, {}),
  },
  {
    name: "get_low_stock",
    description: "État du stock et alertes : produits sous le seuil, bilan entrées/sorties 30 jours.",
    parameters: {
      type: "object",
      properties: { productId: { type: "string", description: "Id produit optionnel" } },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.stock.getStockStats, {
        productId: a.productId ? (a.productId as Id<"products">) : undefined,
      }),
  },
  {
    name: "get_cash_discrepancy_report",
    description: "Écarts de caisse sur une période : somme, nombre de sessions, détail par caissier.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string" },
        endDate: { type: "string" },
        userId: { type: "string", description: "filtre caissier optionnel" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getCashDiscrepancyReport, {
        startDate: str(a.startDate),
        endDate: str(a.endDate),
        userId: str(a.userId),
      }),
  },
  {
    name: "get_expenses_summary",
    description: "Total et détail des dépenses sur une période, par catégorie et statut.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string" },
        endDate: { type: "string" },
        category: { type: "string", enum: ["fournitures", "transport", "maintenance", "autre"] },
        status: { type: "string", enum: ["pending", "approved", "rejected", "withdrawn"] },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getExpensesSummaryByPeriod, {
        startDate: str(a.startDate),
        endDate: str(a.endDate),
        category: a.category as "fournitures" | "transport" | "maintenance" | "autre" | undefined,
        status: a.status as "pending" | "approved" | "rejected" | "withdrawn" | undefined,
      }),
  },
  {
    name: "get_audit_logs",
    description:
      "Journal d'audit des actions sensibles (rôles, coffre, dépenses, caisse, stock, produits, clients). Filtrable.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["user", "safe", "expense", "session", "stock", "product", "client"],
        },
        actorId: { type: "string" },
        startDate: { type: "string", description: "AAAA-MM-JJ" },
        endDate: { type: "string", description: "AAAA-MM-JJ" },
        limit: { type: "integer", description: "défaut 50, max 200" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.audit.getAuditLogs, {
        category: a.category as
          | "user"
          | "safe"
          | "expense"
          | "session"
          | "stock"
          | "product"
          | "client"
          | undefined,
        actorId: str(a.actorId),
        startDate: toMs(a.startDate),
        endDate: toMs(a.endDate),
        limit: typeof a.limit === "number" ? Math.min(a.limit, 200) : 50,
      }),
  },
  {
    name: "search_clients",
    description:
      "Recherche un client par nom, téléphone, référence (CLI-xxxxx) ou quartier. À utiliser avant get_client_detail.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "nom, téléphone, référence ou quartier" } },
      required: ["query"],
      additionalProperties: false,
    },
    run: (ctx, a) => ctx.runQuery(api.clients.searchClients, { query: String(a.query) }),
  },
  {
    name: "get_client_detail",
    description:
      "Fiche complète d'un client (Id obtenu via search_clients) : coordonnées, encours, ardoise (ventes à crédit + règlements) et total d'achats sur une période.",
    parameters: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Id client (via search_clients)" },
        startDate: { type: "string" },
        endDate: { type: "string" },
      },
      required: ["clientId"],
      additionalProperties: false,
    },
    run: async (ctx, a) => {
      const clientId = a.clientId as Id<"clients">;
      const [client, ledger, purchases] = await Promise.all([
        ctx.runQuery(api.clients.getClient, { clientId }),
        ctx.runQuery(api.clients.getClientLedger, { clientId }),
        ctx.runQuery(api.analytics.getSalesByClient, {
          clientId,
          startDate: str(a.startDate),
          endDate: str(a.endDate),
        }),
      ]);
      return { client, ledger, purchases };
    },
  },
  // ---- Couverture de données élargie (story 1.6) ----
  {
    name: "get_safe_status",
    description: "Solde actuel du coffre-fort et date de dernière mise à jour.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: (ctx) => ctx.runQuery(api.safe.getSafeStatus, {}),
  },
  {
    name: "get_safe_transactions",
    description:
      "Mouvements du coffre (les plus récents d'abord) : solde initial, retraits (fonds de caisse), dépôts (versements caissiers), ajustements, versements bancaires (sorties). Filtrable par période.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["initial", "withdrawal", "deposit", "adjustment", "bank_deposit"],
        },
        startDate: { type: "string", description: "AAAA-MM-JJ optionnel" },
        endDate: { type: "string", description: "AAAA-MM-JJ optionnel" },
        limit: { type: "integer", description: "défaut 50, max 200" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.safe.getTransactionHistory, {
        startDate: toMs(a.startDate),
        endDate: toMsEnd(a.endDate),
        type: a.type as
          | "initial"
          | "withdrawal"
          | "deposit"
          | "adjustment"
          | "bank_deposit"
          | undefined,
        limit: num(a.limit, 200) ?? 50,
      }),
  },
  {
    name: "list_products",
    description:
      "Catalogue produits : nom, référence, prix de vente, quantité en stock, seuil d'alerte, unité, actif/archivé.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: (ctx) => ctx.runQuery(api.products.getAllProducts, {}),
  },
  {
    name: "get_sales_detail",
    description:
      "Ventes ligne à ligne sur une période (les plus récentes d'abord) : produit, quantité, prix, mode de paiement, client, caissier. Pour le détail ; pour des totaux, préférer get_sales_summary.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "AAAA-MM-JJ inclus" },
        endDate: { type: "string", description: "AAAA-MM-JJ inclus" },
        productId: { type: "string", description: "Id produit optionnel" },
        clientId: { type: "string", description: "Id client optionnel" },
        limit: { type: "integer", description: "défaut 100, max 500" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.sales.getSalesHistory, {
        startDate: toMs(a.startDate),
        endDate: toMsEnd(a.endDate),
        productId: a.productId ? (a.productId as Id<"products">) : undefined,
        clientId: a.clientId ? (a.clientId as Id<"clients">) : undefined,
        limit: num(a.limit, 500) ?? 100,
      }),
  },
  {
    name: "get_stock_movements",
    description:
      "Mouvements de stock sur une période (entrées, sorties, ajustements, dons, conversions) : produit, quantité, motif, stock avant/après, utilisateur.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "AAAA-MM-JJ" },
        endDate: { type: "string", description: "AAAA-MM-JJ" },
        type: { type: "string", enum: ["in", "out", "adjustment", "donation", "conversion"] },
        productId: { type: "string", description: "Id produit optionnel" },
        limit: { type: "integer", description: "défaut 100, max 500" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.stock.getStockHistory, {
        startDate: toMs(a.startDate),
        endDate: toMsEnd(a.endDate),
        type: a.type as "in" | "out" | "adjustment" | "donation" | "conversion" | undefined,
        productId: a.productId ? (a.productId as Id<"products">) : undefined,
        limit: num(a.limit, 500) ?? 100,
      }),
  },
  {
    name: "get_expenses_detail",
    description:
      "Dépenses détaillées (demande par demande) sur une période : montant, motif, catégorie, statut, demandeur, approbateur.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "AAAA-MM-JJ" },
        endDate: { type: "string", description: "AAAA-MM-JJ" },
        status: { type: "string", enum: ["pending", "approved", "rejected", "withdrawn"] },
        limit: { type: "integer", description: "défaut 100, max 500" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.expenses.getExpensesHistory, {
        startDate: str(a.startDate),
        endDate: str(a.endDate),
        status: a.status as "pending" | "approved" | "rejected" | "withdrawn" | undefined,
        limit: num(a.limit, 500) ?? 100,
      }),
  },
  {
    name: "get_cash_sessions",
    description:
      "Sessions de caisse (ouverture/clôture) : caissier, date, montants d'ouverture/clôture, montant attendu, écart, statut.",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "AAAA-MM-JJ" },
        endDate: { type: "string", description: "AAAA-MM-JJ" },
        userId: { type: "string", description: "filtre caissier optionnel" },
        limit: { type: "integer", description: "défaut 100, max 500" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.cashSessions.getSessionHistory, {
        startDate: str(a.startDate),
        endDate: str(a.endDate),
        userId: str(a.userId),
        limit: num(a.limit, 500) ?? 100,
      }),
  },
  {
    name: "list_team",
    description:
      "Équipe / utilisateurs : nom, email, rôle (admin/manager/cashier/pending), actif, dernière connexion.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: (ctx) => ctx.runQuery(api.users.listUsers, {}),
  },
  {
    name: "get_pending_operations",
    description:
      "Opérations en attente de traitement par l'admin : demandes de fonds de caisse, versements de caisse à encaisser au coffre, dépenses à valider.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    run: async (ctx) => {
      const [fundRequests, deposits, expenses] = await Promise.all([
        ctx.runQuery(api.safe.getPendingFundRequests, {}),
        ctx.runQuery(api.safe.getPendingDeposits, {}),
        ctx.runQuery(api.expenses.getPendingExpenses, {}),
      ]);
      return { fundRequests, deposits, expenses };
    },
  },
  // ---- Intelligence clients (story 1.7) ----
  {
    name: "list_clients",
    description:
      "Liste / parcourt les clients ; filtre les NOUVEAUX clients par période de création (startDate/endDate en AAAA-MM-JJ, ou days = N derniers jours) et par type (particulier/grossiste). Triés du plus récent au plus ancien, enrichis du nombre d'achats, du dernier achat et du total acheté. Sans période : tous les clients actifs (bornés).",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "AAAA-MM-JJ — début de la fenêtre de création" },
        endDate: { type: "string", description: "AAAA-MM-JJ — fin de la fenêtre de création" },
        days: { type: "integer", description: "Alternative : clients créés dans les N derniers jours" },
        type: { type: "string", enum: ["particulier", "grossiste"] },
        includeInactive: { type: "boolean", description: "inclure les clients archivés (défaut false)" },
        limit: { type: "integer", description: "défaut 50, max 200" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getRecentClients, {
        startDate: str(a.startDate),
        endDate: str(a.endDate),
        days: num(a.days),
        type: a.type as "particulier" | "grossiste" | undefined,
        includeInactive: a.includeInactive === true,
        limit: num(a.limit, 200),
      }),
  },
  {
    name: "get_inactive_clients",
    description:
      "Clients ACTIFS sans achat depuis 'days' jours (défaut 30) — pour les RELANCES d'inactivité. Inclut par défaut les clients n'ayant jamais acheté. Triés du plus inactif au moins inactif, avec téléphone, encours et date du dernier achat.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "integer", description: "seuil d'inactivité en jours (défaut 30)" },
        type: { type: "string", enum: ["particulier", "grossiste"] },
        includeNeverPurchased: {
          type: "boolean",
          description: "inclure ceux qui n'ont jamais acheté (défaut true)",
        },
        limit: { type: "integer", description: "défaut 50, max 200" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getInactiveClients, {
        days: num(a.days),
        type: a.type as "particulier" | "grossiste" | undefined,
        includeNeverPurchased: a.includeNeverPurchased !== false,
        limit: num(a.limit, 200),
      }),
  },
  {
    name: "get_top_clients",
    description:
      "Meilleurs clients par MONTANT acheté sur une période (base des recommandations). Renvoie le total acheté, le nombre d'achats, le dernier achat, l'encours et les produits achetés (byProduct).",
    parameters: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "AAAA-MM-JJ inclus (optionnel)" },
        endDate: { type: "string", description: "AAAA-MM-JJ inclus (optionnel)" },
        limit: { type: "integer", description: "défaut 10, max 100" },
      },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getTopClients, {
        startDate: str(a.startDate),
        endDate: str(a.endDate),
        limit: num(a.limit, 100),
      }),
  },
  {
    name: "get_credit_relances",
    description:
      "Débiteurs à RELANCER pour crédits en retard, triés par ANCIENNETÉ de la dette (daysOverdue = jours depuis la plus ancienne vente à crédit impayée). Renvoie téléphone, encours, ancienneté et nombre de ventes impayées.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "défaut 100, max 300" } },
      required: [],
      additionalProperties: false,
    },
    run: (ctx, a) =>
      ctx.runQuery(api.analytics.getReceivablesAging, { limit: num(a.limit, 300) }),
  },
];

// --------------------------------------------
// Exports préparés par l'IA (PDF / Excel) — story 1.6
// L'IA NE renvoie PAS le jeu de données : prepare_export valide + compte les
// lignes, et le descripteur est attaché au message assistant final. Le navigateur
// re-récupère les données complètes et fabrique le fichier (client-side).
// --------------------------------------------
type ExportFormat = "pdf" | "xlsx";
type ReportKey =
  | "sales"
  | "stock_movements"
  | "receivables"
  | "expenses"
  | "audit_logs"
  | "cash_sessions"
  | "safe_transactions"
  | "new_clients"
  | "inactive_clients"
  | "top_clients";

interface ExportDescriptor {
  report: ReportKey;
  format: ExportFormat;
  title: string;
  rowCount: number;
  params: Record<string, unknown>;
}

const REPORT_LABELS: Record<ReportKey, string> = {
  sales: "Ventes",
  stock_movements: "Mouvements de stock",
  receivables: "Créances clients",
  expenses: "Dépenses",
  audit_logs: "Journal d'audit",
  cash_sessions: "Sessions de caisse",
  safe_transactions: "Transactions du coffre",
  new_clients: "Nouveaux clients",
  inactive_clients: "Clients inactifs",
  top_clients: "Meilleurs clients",
};

const PREPARE_EXPORT_DEF = {
  name: "prepare_export",
  description:
    "Prépare un rapport téléchargeable (PDF ou Excel) à partir des données RÉELLES. À utiliser dès que l'admin demande d'exporter / télécharger / générer un fichier / sortir un rapport. Ne renvoie pas les données : prépare un bouton de téléchargement attaché à ta réponse. Indique ensuite à l'admin que le fichier est prêt (nom + nombre de lignes).",
  parameters: {
    type: "object",
    properties: {
      report: {
        type: "string",
        enum: [
          "sales",
          "stock_movements",
          "receivables",
          "expenses",
          "audit_logs",
          "cash_sessions",
          "safe_transactions",
          "new_clients",
          "inactive_clients",
          "top_clients",
        ],
        description: "Type de rapport à exporter",
      },
      format: { type: "string", enum: ["pdf", "xlsx"], description: "pdf ou xlsx (Excel)" },
      startDate: { type: "string", description: "AAAA-MM-JJ (borne incluse, si pertinent)" },
      endDate: { type: "string", description: "AAAA-MM-JJ (borne incluse, si pertinent)" },
      days: {
        type: "integer",
        description:
          "inactive_clients : seuil d'inactivité en jours (défaut 30) ; new_clients : clients créés dans les N derniers jours",
      },
      type: {
        type: "string",
        description:
          "Filtre type — stock_movements: in/out/adjustment/donation/conversion ; safe_transactions: initial/withdrawal/deposit/adjustment/bank_deposit ; new_clients/inactive_clients: particulier/grossiste",
      },
      status: {
        type: "string",
        description: "expenses uniquement : pending/approved/rejected/withdrawn",
      },
      category: { type: "string", description: "audit_logs uniquement : catégorie d'action" },
      userId: { type: "string", description: "cash_sessions uniquement : filtre caissier" },
    },
    required: ["report", "format"],
    additionalProperties: false,
  },
};

async function countReportRows(
  ctx: ActionCtx,
  report: ReportKey,
  p: Record<string, unknown>
): Promise<number> {
  switch (report) {
    case "sales":
      return (
        await ctx.runQuery(api.sales.getSalesHistory, {
          startDate: toMs(p.startDate),
          endDate: toMsEnd(p.endDate),
        })
      ).length;
    case "stock_movements":
      return (
        await ctx.runQuery(api.stock.getStockHistory, {
          startDate: toMs(p.startDate),
          endDate: toMsEnd(p.endDate),
          type: p.type as "in" | "out" | "adjustment" | "donation" | "conversion" | undefined,
        })
      ).length;
    case "receivables":
      return (await ctx.runQuery(api.clients.getReceivables, {})).clients.length;
    case "expenses":
      return (
        await ctx.runQuery(api.expenses.getExpensesHistory, {
          startDate: str(p.startDate),
          endDate: str(p.endDate),
          status: p.status as "pending" | "approved" | "rejected" | "withdrawn" | undefined,
        })
      ).length;
    case "audit_logs":
      return (
        await ctx.runQuery(api.audit.getAuditLogs, {
          startDate: toMs(p.startDate),
          endDate: toMsEnd(p.endDate),
          category: p.category as
            | "user"
            | "safe"
            | "expense"
            | "session"
            | "stock"
            | "product"
            | "client"
            | undefined,
        })
      ).length;
    case "cash_sessions":
      return (
        await ctx.runQuery(api.cashSessions.getSessionHistory, {
          startDate: str(p.startDate),
          endDate: str(p.endDate),
          userId: str(p.userId),
        })
      ).length;
    case "safe_transactions":
      return (
        await ctx.runQuery(api.safe.getTransactionHistory, {
          startDate: toMs(p.startDate),
          endDate: toMsEnd(p.endDate),
          type: p.type as
            | "initial"
            | "withdrawal"
            | "deposit"
            | "adjustment"
            | "bank_deposit"
            | undefined,
        })
      ).length;
    case "new_clients":
      return (
        await ctx.runQuery(api.analytics.getRecentClients, {
          startDate: str(p.startDate),
          endDate: str(p.endDate),
          days: num(p.days),
          type: p.type as "particulier" | "grossiste" | undefined,
          limit: CLIENT_EXPORT_LIMIT,
        })
      ).length;
    case "inactive_clients":
      return (
        await ctx.runQuery(api.analytics.getInactiveClients, {
          days: num(p.days),
          type: p.type as "particulier" | "grossiste" | undefined,
          limit: CLIENT_EXPORT_LIMIT,
        })
      ).length;
    case "top_clients":
      return (
        await ctx.runQuery(api.analytics.getTopClients, {
          startDate: str(p.startDate),
          endDate: str(p.endDate),
          limit: TOP_CLIENTS_EXPORT_LIMIT,
        })
      ).length;
  }
}

function exportTitle(report: ReportKey, p: Record<string, unknown>): string {
  const base = REPORT_LABELS[report];
  const start = str(p.startDate);
  const end = str(p.endDate);
  if (report === "inactive_clients") {
    return `${base} (≥ ${num(p.days) ?? 30} j sans achat)`;
  }
  if (report === "new_clients" && num(p.days) && !start && !end) {
    return `${base} (${num(p.days)} derniers jours)`;
  }
  if (start && end) return `${base} du ${start} au ${end}`;
  if (start) return `${base} depuis le ${start}`;
  if (end) return `${base} jusqu'au ${end}`;
  return base;
}

// Exécute prepare_export : renvoie le résumé à donner au modèle + le descripteur à
// attacher (null si invalide ou si aucune donnée).
async function runPrepareExport(
  ctx: ActionCtx,
  rawArgs: string
): Promise<{ descriptor: ExportDescriptor | null; summary: string }> {
  let a: ToolArgs;
  try {
    a = rawArgs ? (JSON.parse(rawArgs) as ToolArgs) : {};
  } catch {
    return { descriptor: null, summary: JSON.stringify({ error: "Arguments JSON invalides" }) };
  }
  const report = String(a.report ?? "") as ReportKey;
  if (!REPORT_LABELS[report]) {
    return {
      descriptor: null,
      summary: JSON.stringify({
        error: `Rapport inconnu : ${String(a.report)}. Choix possibles : ${Object.keys(REPORT_LABELS).join(", ")}`,
      }),
    };
  }
  const format: ExportFormat | null =
    a.format === "pdf" ? "pdf" : a.format === "xlsx" ? "xlsx" : null;
  if (!format) {
    return { descriptor: null, summary: JSON.stringify({ error: "format doit être 'pdf' ou 'xlsx'" }) };
  }
  const params: Record<string, unknown> = {};
  for (const k of ["startDate", "endDate", "type", "status", "category", "userId"]) {
    if (a[k] !== undefined && a[k] !== null && a[k] !== "") params[k] = a[k];
  }
  // `days` normalisé à la source (number) : le modèle peut l'émettre en chaîne et
  // num() la coerce, tandis que le front ne lit que les number — sans cette
  // normalisation, comptage serveur et fichier client divergeraient sur le seuil.
  const daysNum = num(a.days);
  if (daysNum !== undefined) params.days = daysNum;
  let rowCount = 0;
  try {
    rowCount = await countReportRows(ctx, report, params);
  } catch (e) {
    return {
      descriptor: null,
      summary: JSON.stringify({ error: e instanceof Error ? e.message : "Erreur de préparation de l'export" }),
    };
  }
  const title = exportTitle(report, params);
  if (rowCount === 0) {
    return {
      descriptor: null,
      summary: JSON.stringify({
        ok: false,
        report,
        format,
        rowCount: 0,
        message: "Aucune donnée pour ces critères : aucun fichier n'a été préparé.",
      }),
    };
  }
  return {
    descriptor: { report, format, title, rowCount, params },
    summary: JSON.stringify({ ok: true, report, format, rowCount, title }),
  };
}

function toolDefinitions() {
  return [
    ...TOOLS.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
    { type: "function" as const, function: PREPARE_EXPORT_DEF },
  ];
}

function truncate(result: unknown): string {
  const json = JSON.stringify(result ?? null);
  if (json.length <= MAX_TOOL_RESULT_CHARS) return json;
  return json.slice(0, MAX_TOOL_RESULT_CHARS) + '..."[tronqué]"';
}

async function executeTool(ctx: ActionCtx, name: string, rawArgs: string): Promise<string> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return JSON.stringify({ error: `Outil inconnu : ${name}` });
  let parsed: ToolArgs;
  try {
    parsed = rawArgs ? (JSON.parse(rawArgs) as ToolArgs) : {};
  } catch {
    return JSON.stringify({ error: "Arguments JSON invalides" });
  }
  try {
    const result = await tool.run(ctx, parsed);
    return truncate(result);
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : "Erreur d'exécution de l'outil" });
  }
}

async function callDeepSeek(
  apiKey: string,
  body: Record<string, unknown>
): Promise<DeepSeekResponse> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const resp = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) return (await resp.json()) as DeepSeekResponse;
    if (resp.status === 401) throw new Error("Clé DeepSeek invalide (401).");
    if (resp.status === 402)
      throw new Error("Solde DeepSeek épuisé (402). Rechargez votre crédit DeepSeek.");
    if (resp.status === 429 || resp.status >= 500) {
      lastErr = new Error(`Service DeepSeek momentanément indisponible (${resp.status}).`);
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }
    const text = await resp.text();
    throw new Error(`Erreur DeepSeek ${resp.status} : ${text.slice(0, 200)}`);
  }
  throw lastErr ?? new Error("Service DeepSeek indisponible.");
}

// --------------------------------------------
// Auth helper (admin)
// --------------------------------------------
async function requireAdmin(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user || user.role !== "admin") return null;
  return { identity, user };
}

// --------------------------------------------
// Internes (persistance — appelées par l'action)
// --------------------------------------------
export const loadHistory = internalQuery({
  args: { conversationId: v.id("assistantConversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

export const createConversation = internalMutation({
  args: { userId: v.string(), title: v.optional(v.string()), model: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("assistantConversations", {
      userId: args.userId,
      title: args.title,
      model: args.model,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
      messageCount: 0,
    });
  },
});

export const addMessage = internalMutation({
  args: {
    conversationId: v.id("assistantConversations"),
    userId: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("tool"),
      v.literal("system")
    ),
    content: v.string(),
    toolCalls: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    exports: v.optional(v.string()),
    tokensPrompt: v.optional(v.number()),
    tokensCompletion: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.insert("assistantMessages", { ...args, createdAt: now });
    const conv = await ctx.db.get(args.conversationId);
    if (conv) {
      await ctx.db.patch(args.conversationId, {
        updatedAt: now,
        lastMessageAt: now,
        messageCount: (conv.messageCount ?? 0) + 1,
      });
    }
  },
});

// --------------------------------------------
// Queries (admin)
// --------------------------------------------
export const getConversations = query({
  args: {},
  handler: async (ctx) => {
    const auth = await requireAdmin(ctx);
    if (!auth) return [];
    return await ctx.db
      .query("assistantConversations")
      .withIndex("by_user_updated", (q) => q.eq("userId", auth.identity.subject))
      .order("desc")
      .collect();
  },
});

export const getMessages = query({
  args: { conversationId: v.id("assistantConversations") },
  handler: async (ctx, args) => {
    const auth = await requireAdmin(ctx);
    if (!auth) return [];
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== auth.identity.subject) return [];
    const messages = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
    // L'UI n'affiche que user/assistant (les messages "tool" sont internes)
    return messages.filter((m) => m.role === "user" || m.role === "assistant");
  },
});

// Supprime une conversation (et tous ses messages) — admin + propriétaire uniquement.
export const deleteConversation = mutation({
  args: { conversationId: v.id("assistantConversations") },
  handler: async (ctx, args) => {
    const auth = await requireAdmin(ctx);
    if (!auth) throw new Error("Action réservée aux administrateurs");
    const conv = await ctx.db.get(args.conversationId);
    if (!conv || conv.userId !== auth.identity.subject) {
      throw new Error("Conversation introuvable");
    }
    // Supprimer d'abord les messages (sinon orphelins), puis la conversation.
    const messages = await ctx.db
      .query("assistantMessages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .collect();
    for (const m of messages) {
      await ctx.db.delete(m._id);
    }
    await ctx.db.delete(args.conversationId);
    return { deleted: true, messageCount: messages.length };
  },
});

// --------------------------------------------
// Action principale
// --------------------------------------------
export const ask = action({
  args: {
    conversationId: v.optional(v.id("assistantConversations")),
    message: v.string(),
  },
  handler: async (ctx, args): Promise<{ conversationId: Id<"assistantConversations">; answer: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non authentifié");
    const user = await ctx.runQuery(api.users.getCurrentUser, {});
    if (!user || user.role !== "admin") {
      throw new Error("Assistant réservé aux administrateurs");
    }

    // Accès aux variables d'env Convex sans dépendre du typage Node (portable build front/back)
    const env =
      (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const apiKey = env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error("Assistant non configuré : clé DeepSeek manquante (DEEPSEEK_API_KEY).");
    }
    const model = env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;

    const question = args.message.trim();
    if (!question) throw new Error("Question vide");

    // Conversation
    let conversationId = args.conversationId;
    if (!conversationId) {
      conversationId = await ctx.runMutation(internal.assistant.createConversation, {
        userId: identity.subject,
        title: question.slice(0, 60),
        model,
      });
    }

    // Persister la question
    await ctx.runMutation(internal.assistant.addMessage, {
      conversationId,
      userId: identity.subject,
      role: "user",
      content: question,
    });

    // Reconstruire l'historique OpenAI
    const history = await ctx.runQuery(internal.assistant.loadHistory, { conversationId });
    const today = new Date().toISOString().split("T")[0];
    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nDate du jour : ${today}.` },
    ];
    for (const m of history) {
      if (m.role === "user") {
        messages.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        let tc: ToolCall[] | undefined;
        try {
          tc = m.toolCalls ? (JSON.parse(m.toolCalls) as ToolCall[]) : undefined;
        } catch {
          tc = undefined; // toolCalls corrompu : on rejoue le message sans tool_calls
        }
        messages.push({ role: "assistant", content: m.content, ...(tc ? { tool_calls: tc } : {}) });
      } else if (m.role === "tool") {
        messages.push({ role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" });
      }
    }

    const tools = toolDefinitions();
    const startedAt = Date.now();
    const preparedExports: ExportDescriptor[] = [];

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const lastTurn = iter === MAX_ITERATIONS - 1;
      const data = await callDeepSeek(apiKey, {
        model,
        messages,
        tools,
        tool_choice: lastTurn ? "none" : "auto",
        temperature: 0.2,
      });

      const choice = data.choices?.[0];
      const msg = choice?.message;
      const toolCalls = msg?.tool_calls;

      if (!lastTurn && choice?.finish_reason === "tool_calls" && toolCalls && toolCalls.length) {
        // Tour outils : pousser le message assistant (avec tool_calls) puis les résultats
        messages.push({ role: "assistant", content: msg?.content ?? "", tool_calls: toolCalls });
        await ctx.runMutation(internal.assistant.addMessage, {
          conversationId,
          userId: identity.subject,
          role: "assistant",
          content: msg?.content ?? "",
          toolCalls: JSON.stringify(toolCalls),
        });

        for (const tc of toolCalls) {
          let result: string;
          if (tc.function.name === "prepare_export") {
            // Cas spécial : on collecte le descripteur d'export (attaché au message final)
            const { descriptor, summary } = await runPrepareExport(ctx, tc.function.arguments);
            if (descriptor) preparedExports.push(descriptor);
            result = summary;
          } else {
            result = await executeTool(ctx, tc.function.name, tc.function.arguments);
          }
          messages.push({ role: "tool", content: result, tool_call_id: tc.id });
          await ctx.runMutation(internal.assistant.addMessage, {
            conversationId,
            userId: identity.subject,
            role: "tool",
            content: result,
            toolCallId: tc.id,
            toolName: tc.function.name,
          });
        }
        continue;
      }

      // Réponse finale
      const answer = msg?.content?.trim() || "Je ne sais pas, cette information n'est pas disponible dans les données.";
      await ctx.runMutation(internal.assistant.addMessage, {
        conversationId,
        userId: identity.subject,
        role: "assistant",
        content: answer,
        exports: preparedExports.length ? JSON.stringify(preparedExports) : undefined,
        tokensPrompt: data.usage?.prompt_tokens,
        tokensCompletion: data.usage?.completion_tokens,
        latencyMs: Date.now() - startedAt,
      });
      return { conversationId, answer };
    }

    // Sécurité (ne devrait pas arriver : dernier tour force tool_choice=none)
    const fallback = "Je n'ai pas pu finaliser la réponse (trop d'étapes). Reformulez votre question.";
    await ctx.runMutation(internal.assistant.addMessage, {
      conversationId,
      userId: identity.subject,
      role: "assistant",
      content: fallback,
      exports: preparedExports.length ? JSON.stringify(preparedExports) : undefined,
      errorCode: "max_iterations",
    });
    return { conversationId, answer: fallback };
  },
});
