import { v } from "convex/values";
import { action, query, internalQuery, internalMutation } from "./_generated/server";
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

const SYSTEM_PROMPT = `Tu es l'assistant de gestion de LOCAGRI, un point de vente de produits agricoles. Tu réponds à l'ADMINISTRATEUR, en français, de façon concise et factuelle.
RÈGLE ABSOLUE : tu ne réponds QUE sur la base des données renvoyées par tes outils. Tu n'inventes JAMAIS un chiffre, un nom, un solde ni une date. Si aucun outil ne fournit l'information, réponds exactement : "Je ne sais pas, cette information n'est pas disponible dans les données."
Pour toute question chiffrée (CA, stock, créances, dépenses, écarts), appelle l'outil correspondant et cite la période couverte. Ne te fie pas à ta mémoire.
Monnaie : toujours en FCFA, nombres entiers, séparateur de milliers (ex. 1 250 000 FCFA). Dates : convertis "ce mois", "hier", "la semaine dernière" en bornes AAAA-MM-JJ à partir de la date du jour fournie.
Pour un client cité par son nom : appelle d'abord search_clients, puis get_client_detail. Pour une synthèse ("fais le point") : get_business_dashboard.
Tu as un accès LECTURE SEULE : tu ne peux RIEN modifier, valider, approuver, supprimer ni créer. Si on te le demande, explique que tu es en lecture seule et indique l'écran de l'application à utiliser.
Réponds en 1 à 4 phrases ou une courte liste, le chiffre clé en premier. Si un outil renvoie une liste vide ou null, dis qu'il n'y a pas de données pour ce critère.`;

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
];

function toolDefinitions() {
  return TOOLS.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
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
        const tc = m.toolCalls ? (JSON.parse(m.toolCalls) as ToolCall[]) : undefined;
        messages.push({ role: "assistant", content: m.content, ...(tc ? { tool_calls: tc } : {}) });
      } else if (m.role === "tool") {
        messages.push({ role: "tool", content: m.content, tool_call_id: m.toolCallId ?? "" });
      }
    }

    const tools = toolDefinitions();
    const startedAt = Date.now();

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
          const result = await executeTool(ctx, tc.function.name, tc.function.arguments);
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
      errorCode: "max_iterations",
    });
    return { conversationId, answer: fallback };
  },
});
