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
      v.literal("movement"),
      v.literal("payment"),
      v.literal("donation"),
      v.literal("log")
    ),
    date: v.optional(v.string()),   // Format "YYYYMMDD" pour les compteurs quotidiens (sale, movement, payment, donation)
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
    quartier: v.optional(v.string()),   // Quartier de résidence (optionnel)
    notes: v.optional(v.string()),      // Notes sur le client
    balance: v.optional(v.number()),    // Encours (total dû) — crédit/ardoise, défaut 0
    type: v.optional(v.union(           // Type de client (défaut: particulier si absent)
      v.literal("particulier"),
      v.literal("grossiste")
    )),
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
  // RÈGLEMENTS CLIENTS (remboursements de crédit)
  // ============================================
  clientPayments: defineTable({
    reference: v.string(),           // Code unique: REG-YYYYMMDD-XXXXX
    clientId: v.id("clients"),
    clientReference: v.string(),     // Référence client (dénormalisé)
    clientName: v.string(),          // Nom client (dénormalisé)
    amount: v.number(),              // Montant du règlement
    method: v.union(                 // Moyen de règlement
      v.literal("cash"),
      v.literal("mobile_money")
    ),
    date: v.number(),                // Timestamp
    userId: v.string(),              // Caissier qui encaisse
    userName: v.string(),            // Nom (dénormalisé)
    sessionId: v.optional(v.id("cashSessions")), // Session de caisse (règlement espèces)
    note: v.optional(v.string()),    // Note éventuelle
    balanceAfter: v.number(),        // Encours du client après ce règlement (audit)
  })
    .index("by_client", ["clientId"])
    .index("by_date", ["date"])
    .index("by_session", ["sessionId"]),

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
      v.literal("mobile_money"),
      v.literal("credit")          // Vente à crédit (ardoise)
    ),
    // Crédit (vente à terme — tout ou rien)
    paymentStatus: v.optional(v.union(v.literal("paid"), v.literal("unpaid"))),
    amountDue: v.optional(v.number()), // Reste dû sur cette vente à crédit (0 si soldée)
    // Encaissement & rendu de monnaie (optionnels — rétro-compat)
    amountReceived: v.optional(v.number()),   // Espèces remises par le client (vente espèces)
    changeDue: v.optional(v.number()),        // Monnaie à rendre = amountReceived - total (>= 0)
    changeMethod: v.optional(v.union(         // Moyen de rendu (présent seulement si changeDue > 0)
      v.literal("cash"),
      v.literal("mobile_money")
    )),
    mobileMoneyChange: v.optional(v.number()), // Part de la monnaie rendue via Mobile Money (0 sinon)
    // Client (optionnel)
    clientId: v.optional(v.id("clients")),     // Référence au client
    clientReference: v.optional(v.string()),   // Référence client (dénormalisé)
    clientName: v.optional(v.string()),        // Nom complet client (dénormalisé)
    clientType: v.optional(v.union(            // Type de client au moment de la vente (dénormalisé)
      v.literal("particulier"),
      v.literal("grossiste")
    )),
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
      v.literal("adjustment"),     // Ajustement (inventaire)
      v.literal("donation")        // Don (sortie sans encaissement)
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
    // Lien avec don si applicable
    donationId: v.optional(v.id("donations")), // ID du don associé
    donationReference: v.optional(v.string()), // Référence don (dénormalisé)
  })
    .index("by_date", ["date"])
    .index("by_reference", ["reference"])
    .index("by_type", ["type"])
    .index("by_sale", ["saleId"])
    .index("by_donation", ["donationId"]),

  // ============================================
  // DONS (sorties de stock sans encaissement)
  // ============================================
  donations: defineTable({
    reference: v.string(),         // Code unique: DON-YYYYMMDD-XXXXX
    date: v.number(),              // Timestamp du don
    donorName: v.string(),         // Personne de l'entreprise effectuant le don
    motif: v.optional(v.string()), // Motif du don (optionnel)
    items: v.array(               // Lignes du don (agrégées : une entrée par produit distinct)
      v.object({
        productId: v.id("products"),
        productName: v.string(),
        productReference: v.optional(v.string()),
        quantity: v.number(),          // Quantité donnée (positive)
        unitValue: v.number(),         // Prix catalogue au moment du don
        lineValue: v.number(),         // unitValue * quantity (valeur estimée)
        previousStock: v.number(),     // Stock avant ce don (pour ce produit)
        newStock: v.number(),          // Stock après ce don (pour ce produit)
      })
    ),
    totalQuantity: v.number(),     // Σ quantity (unités données)
    totalValue: v.number(),        // Σ lineValue (valeur estimée totale, informative)
    itemCount: v.number(),         // Nombre de lignes (produits distincts)
    userId: v.string(),            // ID Clerk de l'opérateur qui enregistre
    userName: v.string(),          // Nom (dénormalisé)
  })
    .index("by_date", ["date"])
    .index("by_reference", ["reference"]),

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
    totalMobileChangeGiven: v.optional(v.number()), // Monnaie rendue via Mobile Money (espèces gardées en caisse)
    totalCashRepayments: v.optional(v.number()), // Règlements clients en espèces (entrées en caisse)
    salesCount: v.optional(v.number()),       // Nombre de ventes
    reopenedAt: v.optional(v.number()),       // Timestamp de réouverture (si réouverte)
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_status", ["userId", "status"])
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
      v.literal("adjustment"),       // Ajustement manuel
      v.literal("bank_deposit")      // Versement vers le compte bancaire de l'entreprise (sortie)
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
  // JOURNAL D'AUDIT (actions sensibles)
  // ============================================
  auditLogs: defineTable({
    reference: v.string(),           // Code unique: LOG-YYYYMMDD-XXXXX
    date: v.number(),                // Timestamp de l'action
    actorId: v.string(),             // ID Clerk de l'auteur
    actorName: v.string(),           // Nom (dénormalisé)
    actorRole: v.string(),           // Rôle au moment de l'action
    action: v.string(),              // Clé typée (ex. "user.role_changed")
    category: v.union(
      v.literal("user"),
      v.literal("safe"),
      v.literal("expense"),
      v.literal("session"),
      v.literal("stock"),
      v.literal("product"),
      v.literal("client")
    ),
    summary: v.string(),             // Description lisible (FR)
    targetType: v.optional(v.string()),  // Type d'entité ciblée
    targetId: v.optional(v.string()),    // ID de l'entité ciblée
    targetRef: v.optional(v.string()),   // Référence de l'entité (si applicable)
    targetName: v.optional(v.string()),  // Nom de l'entité (dénormalisé)
    before: v.optional(v.string()),  // Valeur avant (rôle, prix, solde, statut...)
    after: v.optional(v.string()),   // Valeur après
    metadata: v.optional(v.string()), // Contexte additionnel (JSON)
  })
    .index("by_date", ["date"])
    .index("by_actor", ["actorId"])
    .index("by_category", ["category"])
    .index("by_reference", ["reference"]),

  // ============================================
  // ASSISTANT IA — conversations & messages (admin)
  // ============================================
  assistantConversations: defineTable({
    userId: v.string(),              // clerkId de l'admin propriétaire
    title: v.optional(v.string()),   // résumé auto (1er message)
    createdAt: v.number(),
    updatedAt: v.number(),
    lastMessageAt: v.optional(v.number()),
    messageCount: v.optional(v.number()),
    model: v.optional(v.string()),   // modèle utilisé (ex. deepseek-chat)
    archived: v.optional(v.boolean()),
  })
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_user", ["userId"]),

  assistantMessages: defineTable({
    conversationId: v.id("assistantConversations"),
    userId: v.string(),              // dénormalisé (sécurité/filtre)
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("tool"),
      v.literal("system")
    ),
    content: v.string(),             // texte ; pour role "tool" = JSON tronqué
    toolCalls: v.optional(v.string()),   // JSON des tool_calls (assistant), pour rejouer
    toolCallId: v.optional(v.string()),  // pour role "tool"
    toolName: v.optional(v.string()),    // nom de l'outil appelé
    exports: v.optional(v.string()),     // JSON: descripteurs d'exports préparés (PDF/Excel) attachés à un message assistant
    createdAt: v.number(),
    tokensPrompt: v.optional(v.number()),
    tokensCompletion: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    errorCode: v.optional(v.string()),
  })
    .index("by_conversation", ["conversationId", "createdAt"])
    .index("by_user", ["userId"]),

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
