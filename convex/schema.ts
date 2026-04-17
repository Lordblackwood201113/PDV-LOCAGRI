import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // COMPTEURS DE RÉFÉRENCES (pour génération auto)
  // ============================================
  counters: defineTable({
    type: v.union(
      v.literal("product"),
      v.literal("client"),
      v.literal("sale"),
      v.literal("movement")
    ),
    date: v.optional(v.string()),   // Format "YYYYMMDD" pour les compteurs quotidiens (sale, movement)
    count: v.number(),              // Dernier numéro utilisé
  })
    .index("by_type", ["type"])
    .index("by_type_date", ["type", "date"]),

  // ============================================
  // CLIENTS (optionnel lors des ventes)
  // ============================================
  clients: defineTable({
    reference: v.string(),          // Code unique: CLI-XXXXX
    firstName: v.optional(v.string()),  // Prénom (optionnel)
    lastName: v.optional(v.string()),   // Nom (optionnel)
    phone: v.optional(v.string()),      // Contact téléphone (optionnel)
    email: v.optional(v.string()),      // Email (optionnel)
    notes: v.optional(v.string()),      // Notes sur le client
    createdAt: v.number(),          // Date de création
    createdById: v.string(),        // ID de l'utilisateur qui a créé
    createdByName: v.string(),      // Nom (dénormalisé)
    isActive: v.boolean(),          // Client actif ou archivé
  })
    .index("by_reference", ["reference"])
    .index("by_phone", ["phone"])
    .index("by_active", ["isActive"])
    .searchIndex("search_clients", {
      searchField: "lastName",
      filterFields: ["isActive"],
    }),

  // ============================================
  // PRODUITS (catalogue multi-produits)
  // ============================================
  products: defineTable({
    reference: v.optional(v.string()), // Code unique: PRD-XXXXX (optional for legacy)
    name: v.string(),              // Nom du produit (ex: "Riz 4.5 Kg")
    description: v.optional(v.string()), // Description optionnelle
    price: v.number(),             // Prix de vente actuel (FCFA)
    stockQuantity: v.number(),     // Quantité en stock
    alertThreshold: v.number(),    // Seuil d'alerte stock bas
    unit: v.optional(v.string()),  // Unité de mesure (ex: "sac", "kg", "pièce") - optional for legacy data
    isActive: v.optional(v.boolean()), // Produit actif ou archivé - optional for legacy data
    createdAt: v.optional(v.number()), // Date de création - optional for legacy data
    updatedAt: v.number(),         // Timestamp dernière modification
  })
    .index("by_active", ["isActive"])
    .index("by_name", ["name"])
    .index("by_reference", ["reference"]),

  // ============================================
  // VENTES
  // ============================================
  sales: defineTable({
    reference: v.optional(v.string()), // Code unique: VNT-YYYYMMDD-XXXXX (optional for legacy)
    date: v.number(),              // Timestamp de la vente
    productId: v.optional(v.id("products")),   // Référence au produit vendu - optional for legacy
    productName: v.optional(v.string()),       // Nom du produit (dénormalisé) - optional for legacy
    productReference: v.optional(v.string()),  // Référence produit (dénormalisé)
    quantity: v.number(),          // Nombre d'unités vendues
    unitPrice: v.number(),         // Prix unitaire au moment de la vente
    total: v.number(),             // Montant total
    paymentMethod: v.union(
      v.literal("cash"),
      v.literal("mobile_money")
    ),
    // Client (optionnel)
    clientId: v.optional(v.id("clients")),     // Référence au client
    clientReference: v.optional(v.string()),   // Référence client (dénormalisé)
    clientName: v.optional(v.string()),        // Nom complet client (dénormalisé)
    // Utilisateur
    userId: v.string(),            // ID Clerk de l'utilisateur
    userName: v.string(),          // Nom du caissier (dénormalisé)
  })
    .index("by_date", ["date"])
    .index("by_reference", ["reference"])
    .index("by_user", ["userId"])
    .index("by_client", ["clientId"])
    .index("by_payment_method", ["paymentMethod"]),

  // ============================================
  // MOUVEMENTS DE STOCK
  // ============================================
  stockMovements: defineTable({
    reference: v.optional(v.string()), // Code unique: MVT-YYYYMMDD-XXXXX (optional for legacy)
    date: v.number(),              // Timestamp du mouvement
    productId: v.optional(v.id("products")),   // Référence au produit - optional for legacy
    productName: v.optional(v.string()),       // Nom du produit (dénormalisé) - optional for legacy
    productReference: v.optional(v.string()),  // Référence produit (dénormalisé)
    type: v.union(
      v.literal("in"),             // Entrée (approvisionnement)
      v.literal("out"),            // Sortie (vente)
      v.literal("adjustment")      // Ajustement (inventaire)
    ),
    quantity: v.number(),          // Quantité (positive)
    reason: v.string(),            // Motif du mouvement
    userId: v.string(),            // ID utilisateur
    userName: v.string(),          // Nom utilisateur (dénormalisé)
    previousStock: v.number(),     // Stock avant mouvement
    newStock: v.number(),          // Stock après mouvement
    // Lien avec vente si applicable
    saleId: v.optional(v.id("sales")),         // ID de la vente associée
    saleReference: v.optional(v.string()),     // Référence vente (dénormalisé)
  })
    .index("by_date", ["date"])
    .index("by_reference", ["reference"])
    .index("by_type", ["type"])
    .index("by_sale", ["saleId"]),

  // ============================================
  // SESSIONS DE CAISSE
  // ============================================
  cashSessions: defineTable({
    userId: v.string(),            // ID Clerk du caissier
    userName: v.string(),          // Nom du caissier (dénormalisé)
    date: v.string(),              // Format "YYYY-MM-DD" (une session par jour par caissier)
    openingAmount: v.number(),     // Montant en espèces à l'ouverture (FCFA)
    openedAt: v.number(),          // Timestamp d'ouverture
    closingAmount: v.optional(v.number()),    // Montant réel à la clôture
    closedAt: v.optional(v.number()),         // Timestamp de clôture
    expectedAmount: v.optional(v.number()),   // Montant théorique calculé
    discrepancy: v.optional(v.number()),      // Écart (closingAmount - expectedAmount)
    discrepancyReason: v.optional(v.string()), // Justification si écart
    status: v.union(
      v.literal("open"),           // Session en cours
      v.literal("closed")          // Session clôturée
    ),
    // Statistiques de la session (calculées à la clôture)
    totalCashSales: v.optional(v.number()),   // Total ventes espèces
    totalMobileSales: v.optional(v.number()), // Total ventes Mobile Money
    salesCount: v.optional(v.number()),       // Nombre de ventes
    reopenedAt: v.optional(v.number()),       // Timestamp de réouverture (si réouverte)
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_status", ["status"])
    .index("by_date", ["date"]),

  // ============================================
  // COFFRE-FORT
  // ============================================
  safe: defineTable({
    currentBalance: v.number(),      // Solde actuel du coffre
    lastUpdated: v.number(),         // Timestamp dernière mise à jour
    updatedBy: v.string(),           // ID de l'utilisateur qui a fait la dernière opération
    updatedByName: v.string(),       // Nom (dénormalisé)
  }),

  // ============================================
  // TRANSACTIONS COFFRE
  // ============================================
  safeTransactions: defineTable({
    type: v.union(
      v.literal("initial"),          // Solde initial de démarrage
      v.literal("withdrawal"),       // Retrait (fond de caisse)
      v.literal("deposit"),          // Dépôt (versement caissier)
      v.literal("adjustment")        // Ajustement manuel
    ),
    amount: v.number(),              // Montant de la transaction
    previousBalance: v.number(),     // Solde avant
    newBalance: v.number(),          // Solde après
    performedById: v.string(),       // ID de l'admin/manager qui effectue
    performedByName: v.string(),     // Nom (dénormalisé)
    relatedUserId: v.optional(v.string()),      // Caissier concerné (si applicable)
    relatedUserName: v.optional(v.string()),    // Nom du caissier
    relatedSessionId: v.optional(v.id("cashSessions")), // Session liée
    reason: v.string(),              // Motif de l'opération
    date: v.number(),                // Timestamp
  })
    .index("by_date", ["date"])
    .index("by_type", ["type"])
    .index("by_related_user", ["relatedUserId"]),

  // ============================================
  // DEMANDES DE FOND DE CAISSE (en attente de validation admin)
  // ============================================
  cashFundRequests: defineTable({
    requesterId: v.string(),         // ID du caissier qui demande
    requesterName: v.string(),       // Nom du caissier
    status: v.union(
      v.literal("pending"),          // En attente
      v.literal("approved"),         // Approuvé (fond donné)
      v.literal("rejected")          // Rejeté
    ),
    requestedAt: v.number(),         // Timestamp de la demande
    // Champs remplis à l'approbation
    approvedById: v.optional(v.string()),
    approvedByName: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    amountGiven: v.optional(v.number()),       // Montant du fond de caisse donné
    sessionId: v.optional(v.id("cashSessions")), // Session créée
    // Champs en cas de rejet
    rejectionReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_requester", ["requesterId"]),

  // ============================================
  // VERSEMENTS EN ATTENTE (après clôture caisse)
  // ============================================
  pendingDeposits: defineTable({
    cashierId: v.string(),           // ID du caissier
    cashierName: v.string(),         // Nom du caissier
    sessionId: v.id("cashSessions"), // Session clôturée
    expectedAmount: v.number(),      // Montant attendu (clôture)
    closedAt: v.number(),            // Timestamp de clôture
    status: v.union(
      v.literal("pending"),          // En attente de versement
      v.literal("deposited")         // Versé au coffre
    ),
    // Champs remplis au dépôt
    depositedById: v.optional(v.string()),
    depositedByName: v.optional(v.string()),
    depositedAt: v.optional(v.number()),
    actualAmount: v.optional(v.number()),      // Montant réellement versé
    discrepancyNote: v.optional(v.string()),   // Note si écart
  })
    .index("by_status", ["status"])
    .index("by_cashier", ["cashierId"])
    .index("by_session", ["sessionId"]),

  // ============================================
  // DEMANDES DE DÉPENSES
  // ============================================
  expenses: defineTable({
    date: v.number(),              // Timestamp de la demande
    amount: v.number(),            // Montant demandé (FCFA)
    reason: v.string(),            // Motif de la dépense
    category: v.union(
      v.literal("fournitures"),    // Fournitures bureau/magasin
      v.literal("transport"),      // Frais de transport
      v.literal("maintenance"),    // Réparations, entretien
      v.literal("autre")           // Autres dépenses
    ),
    status: v.union(
      v.literal("pending"),        // En attente de validation
      v.literal("approved"),       // Approuvée
      v.literal("rejected"),       // Rejetée
      v.literal("withdrawn")       // Retirée de la caisse
    ),
    requesterId: v.string(),       // ID Clerk du demandeur
    requesterName: v.string(),     // Nom du demandeur (dénormalisé)
    // Champs pour l'approbation
    approvedById: v.optional(v.string()),    // ID de l'admin qui a approuvé
    approvedByName: v.optional(v.string()),  // Nom de l'admin
    approvedAt: v.optional(v.number()),      // Timestamp d'approbation
    rejectionReason: v.optional(v.string()), // Motif de rejet
    // Champs pour le retrait
    withdrawnAt: v.optional(v.number()),     // Timestamp du retrait
    withdrawnFromSessionId: v.optional(v.id("cashSessions")), // Session de caisse utilisée
  })
    .index("by_status", ["status"])
    .index("by_requester", ["requesterId"])
    .index("by_date", ["date"]),

  // ============================================
  // UTILISATEURS (synchronisés avec Clerk)
  // ============================================
  users: defineTable({
    clerkId: v.string(),           // ID Clerk (subject du JWT)
    email: v.string(),             // Email de l'utilisateur
    name: v.string(),              // Nom complet
    role: v.union(
      v.literal("admin"),          // Accès total
      v.literal("manager"),        // Stock + Rapports
      v.literal("cashier"),        // Ventes uniquement
      v.literal("pending")         // En attente de validation
    ),
    isActive: v.boolean(),         // Compte actif ou désactivé
    createdAt: v.number(),         // Date de création
    lastLoginAt: v.optional(v.number()), // Dernière connexion
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"])
    .index("by_role", ["role"]),
});
