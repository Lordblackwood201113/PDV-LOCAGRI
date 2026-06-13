import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { writeAuditLog } from "./audit";

// ============================================
// QUERIES
// ============================================

/**
 * Récupérer l'utilisateur courant depuis la base Convex
 */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
  },
});

/**
 * Lister tous les utilisateurs (admin seulement)
 */
export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    return await ctx.db.query("users").collect();
  },
});

/**
 * Alias pour getAllUsers (utilisé par le frontend)
 */
export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser.role !== "admin") {
      return [];
    }

    return await ctx.db.query("users").collect();
  },
});

/**
 * Compter les utilisateurs en attente de validation (pour notification admin)
 */
export const getPendingUsersCount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return 0;
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    // Seuls les admins voient le nombre d'utilisateurs en attente
    if (!currentUser || currentUser.role !== "admin") {
      return 0;
    }

    const pendingUsers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "pending"))
      .collect();

    return pendingUsers.length;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Créer ou récupérer l'utilisateur lors de la connexion
 * Le premier utilisateur devient automatiquement admin
 */
export const getOrCreateUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    // Chercher un utilisateur existant
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existingUser) {
      // Mettre à jour la date de dernière connexion
      await ctx.db.patch(existingUser._id, {
        lastLoginAt: Date.now(),
        // Mettre à jour le nom si changé dans Clerk
        name: identity.name ?? existingUser.name,
      });
      return existingUser;
    }

    // Vérifier si c'est le premier utilisateur (devient admin)
    const allUsers = await ctx.db.query("users").collect();
    const isFirstUser = allUsers.length === 0;

    // Créer un nouvel utilisateur
    // Le premier utilisateur devient admin, les autres sont en "pending" (attente de validation)
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      email: identity.email ?? "",
      name: identity.name ?? identity.email ?? "Utilisateur",
      role: isFirstUser ? "admin" : "pending",
      isActive: true,
      createdAt: now,
      lastLoginAt: now,
    });

    const newUser = await ctx.db.get(userId);

    // Bootstrap : tracer uniquement la création du tout premier compte (admin).
    // Les créations normales (rôle pending) ne sont pas loguées pour éviter le bruit.
    if (isFirstUser && newUser) {
      await writeAuditLog(ctx, {
        actor: { id: identity.subject, name: newUser.name, role: newUser.role },
        action: "user.admin_bootstrap",
        category: "user",
        summary: `Premier compte créé en administrateur : ${newUser.name}`,
        targetType: "user",
        targetId: userId,
        targetName: newUser.name,
        after: "admin",
      });
    }

    return newUser;
  },
});

/**
 * Modifier le rôle d'un utilisateur (admin seulement)
 */
export const updateUserRole = mutation({
  args: {
    userId: v.id("users"),
    newRole: v.union(
      v.literal("admin"),
      v.literal("manager"),
      v.literal("cashier"),
      v.literal("pending")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    // Vérifier que l'utilisateur courant est admin
    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    // Ne pas permettre de se retirer soi-même le rôle admin
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) {
      throw new Error("Utilisateur non trouvé");
    }

    if (targetUser._id === currentUser._id && args.newRole !== "admin") {
      throw new Error("Vous ne pouvez pas retirer votre propre rôle admin");
    }

    const previousRole = targetUser.role;

    await ctx.db.patch(args.userId, { role: args.newRole });

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: currentUser.name, role: currentUser.role },
      action: "user.role_changed",
      category: "user",
      summary: `Rôle de ${targetUser.name} : ${previousRole} → ${args.newRole}`,
      targetType: "user",
      targetId: args.userId,
      targetName: targetUser.name,
      before: previousRole,
      after: args.newRole,
    });

    return { success: true };
  },
});

/**
 * Activer/Désactiver un utilisateur (admin seulement)
 */
export const toggleUserActive = mutation({
  args: {
    userId: v.id("users"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Non authentifié");
    }

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!currentUser || currentUser.role !== "admin") {
      throw new Error("Accès non autorisé - Admin requis");
    }

    // Ne pas permettre de se désactiver soi-même
    if (args.userId === currentUser._id && !args.isActive) {
      throw new Error("Vous ne pouvez pas désactiver votre propre compte");
    }

    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.patch(args.userId, { isActive: args.isActive });

    await writeAuditLog(ctx, {
      actor: { id: identity.subject, name: currentUser.name, role: currentUser.role },
      action: args.isActive ? "user.activated" : "user.deactivated",
      category: "user",
      summary: `Compte ${targetUser?.name ?? "inconnu"} ${
        args.isActive ? "activé" : "désactivé"
      }`,
      targetType: "user",
      targetId: args.userId,
      targetName: targetUser?.name,
      before: args.isActive ? "désactivé" : "actif",
      after: args.isActive ? "actif" : "désactivé",
    });

    return { success: true };
  },
});
