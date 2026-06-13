import { v } from "convex/values";
import { query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";

// ============================================
// JOURNAL D'AUDIT — helper d'écriture + lecture admin
// ============================================

export type AuditCategory =
  | "user"
  | "safe"
  | "expense"
  | "session"
  | "stock"
  | "product"
  | "client";

const auditCategoryValidator = v.union(
  v.literal("user"),
  v.literal("safe"),
  v.literal("expense"),
  v.literal("session"),
  v.literal("stock"),
  v.literal("product"),
  v.literal("client")
);

interface AuditActor {
  id: string;
  name: string;
  role: string;
}

interface WriteAuditArgs {
  actor: AuditActor;
  action: string;
  category: AuditCategory;
  summary: string;
  targetType?: string;
  targetId?: string;
  targetRef?: string;
  targetName?: string;
  before?: string;
  after?: string;
  metadata?: string;
}

/**
 * Écrit une ligne de journal d'audit, dans la MÊME transaction que l'action.
 * Génère une référence LOG-YYYYMMDD-XXXXX. À appeler après une action réussie,
 * juste avant le `return`. Ne PAS envelopper dans un try/catch qui avalerait
 * l'erreur : un échec d'écriture de log est anormal et doit remonter.
 */
export async function writeAuditLog(
  ctx: MutationCtx,
  args: WriteAuditArgs
): Promise<void> {
  const reference: string = await ctx.runMutation(
    internal.references.getNextReference,
    { type: "log" }
  );

  await ctx.db.insert("auditLogs", {
    reference,
    date: Date.now(),
    actorId: args.actor.id,
    actorName: args.actor.name,
    actorRole: args.actor.role,
    action: args.action,
    category: args.category,
    summary: args.summary,
    targetType: args.targetType,
    targetId: args.targetId,
    targetRef: args.targetRef,
    targetName: args.targetName,
    before: args.before,
    after: args.after,
    metadata: args.metadata,
  });
}

// ============================================
// QUERIES (admin uniquement)
// ============================================

/**
 * Lire le journal d'audit (admin uniquement), filtrable.
 */
export const getAuditLogs = query({
  args: {
    actorId: v.optional(v.string()),
    category: v.optional(auditCategoryValidator),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Réservé à l'admin
    if (!user || user.role !== "admin") return [];

    let logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_date")
      .order("desc")
      .collect();

    if (args.actorId) logs = logs.filter((l) => l.actorId === args.actorId);
    if (args.category) logs = logs.filter((l) => l.category === args.category);
    if (args.startDate !== undefined)
      logs = logs.filter((l) => l.date >= args.startDate!);
    if (args.endDate !== undefined)
      logs = logs.filter((l) => l.date <= args.endDate!);

    return logs.slice(0, args.limit ?? 200);
  },
});

/**
 * Liste des acteurs présents dans le journal (pour le filtre). Admin uniquement.
 */
export const getAuditActors = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user || user.role !== "admin") return [];

    const logs = await ctx.db.query("auditLogs").collect();
    const actors = new Map<string, string>();
    for (const l of logs) actors.set(l.actorId, l.actorName);
    return Array.from(actors.entries()).map(([id, name]) => ({ id, name }));
  },
});
