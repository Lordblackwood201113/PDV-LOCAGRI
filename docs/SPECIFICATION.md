# Spécification PDV LOCAGRI - Système de Point de Vente Riz

> **Date de création**: 27 janvier 2026
> **Statut**: Validé - En attente d'implémentation

---

## 1. Vision du Produit

Système de point de vente simple et efficace pour la commercialisation de riz 4.5 Kg, optimisé pour une utilisation sur tablette avec un design moderne et épuré.

### Contexte Métier
- **Type de vente**: Détail (B2C) - clients individuels
- **Point de vente**: Un seul
- **Produit**: Riz 4.5 Kg uniquement
- **Paiements**: Espèces + Mobile Money (comptant uniquement)
- **Utilisateurs**: 1-3 personnes avec rôles différents

---

## 2. Stack Technique

| Couche | Technologie | Version/Notes |
|--------|-------------|---------------|
| **Authentification** | Clerk | Gestion utilisateurs et rôles |
| **Backend/BaaS** | Convex | Base de données temps réel |
| **Frontend** | React + Vite | Application SPA |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Composants UI** | shadcn/ui | Composants accessibles |

---

## 3. Rôles & Permissions

### Matrice des permissions

| Fonctionnalité | Caissier | Manager | Admin |
|----------------|:--------:|:-------:|:-----:|
| Effectuer une vente | ✅ | ✅ | ✅ |
| Voir ses propres ventes | ✅ | ✅ | ✅ |
| Voir toutes les ventes | ❌ | ✅ | ✅ |
| Gérer le stock (entrées) | ❌ | ✅ | ✅ |
| Accéder aux rapports | ❌ | ✅ | ✅ |
| Exporter les données | ❌ | ✅ | ✅ |
| Gérer les utilisateurs | ❌ | ❌ | ✅ |
| Modifier le prix de vente | ❌ | ❌ | ✅ |
| Configurer les alertes stock | ❌ | ❌ | ✅ |

---

## 4. Modules Fonctionnels

### 4.1 Module Caisse (Ventes)
**Accessible à**: Tous les rôles

**Fonctionnalités:**
- Affichage du stock actuel et prix unitaire
- Saisie de la quantité (boutons +/- ou pavé numérique)
- Sélection du mode de paiement (Espèces / Mobile Money)
- Calcul automatique du total
- Confirmation et enregistrement instantané
- Mise à jour temps réel du stock

**Objectif UX**: Vente complète en moins de 5 secondes

### 4.2 Module Stock
**Accessible à**: Manager, Admin

**Fonctionnalités:**
- Vue du stock actuel avec indicateur visuel
- Alerte stock bas (seuil configurable)
- Entrées de marchandise (approvisionnement)
- Historique complet des mouvements
- Ajustements d'inventaire avec justification

### 4.3 Module Rapports (Dashboard)
**Accessible à**: Manager, Admin

**Fonctionnalités:**
- **Vue journalière**: Total ventes, nombre de transactions, répartition par mode de paiement
- **Tendances**: Graphiques ventes sur semaine/mois
- **Comparaisons**: Performance vs période précédente
- **Export**: Téléchargement CSV pour analyse externe

### 4.4 Module Administration
**Accessible à**: Admin uniquement

**Fonctionnalités:**
- Création/modification des utilisateurs
- Attribution des rôles
- Configuration du prix de vente
- Paramétrage du seuil d'alerte stock

---

## 5. Modèle de Données (Convex)

### Table: products
```typescript
// Table simplifiée - 1 seul produit
{
  name: string,           // "Riz 4.5 Kg"
  price: number,          // Prix de vente actuel
  stockQuantity: number,  // Quantité en stock
  alertThreshold: number, // Seuil alerte stock bas
  updatedAt: number,      // Timestamp dernière modification
}
```

### Table: sales
```typescript
{
  date: number,           // Timestamp de la vente
  quantity: number,       // Nombre de sacs vendus
  unitPrice: number,      // Prix au moment de la vente
  total: number,          // Montant total
  paymentMethod: "cash" | "mobile_money",
  userId: string,         // ID Clerk du caissier
  userName: string,       // Nom du caissier (dénormalisé)
}
```

### Table: stockMovements
```typescript
{
  date: number,           // Timestamp du mouvement
  type: "in" | "out" | "adjustment",
  quantity: number,       // Quantité (positive ou négative)
  reason: string,         // Motif du mouvement
  userId: string,         // ID utilisateur
  userName: string,       // Nom utilisateur (dénormalisé)
  previousStock: number,  // Stock avant mouvement
  newStock: number,       // Stock après mouvement
}
```

---

## 6. Design & UX

### Principes directeurs
1. **Minimaliste**: Palette 2-3 couleurs maximum
2. **Tactile**: Boutons larges (min 48px), zones de tap généreuses
3. **Rapide**: Actions en minimum de taps
4. **Clair**: Typographie lisible, hiérarchie visuelle forte
5. **Responsive**: Priorité tablette, fonctionnel sur desktop

### Palette de couleurs suggérée
- **Primaire**: Vert profond (#1B4332) - confiance, agriculture
- **Accent**: Orange (#F4A261) - actions, alertes
- **Neutre**: Gris (#F8F9FA, #6C757D)
- **Succès**: Vert clair (#40916C)
- **Erreur**: Rouge (#E63946)

### Composants shadcn/ui à utiliser
- Card (sections d'information)
- Button (actions principales)
- Input, Select (formulaires)
- Table (historiques, rapports)
- Dialog (confirmations)
- Toast (notifications)
- Tabs (navigation)
- Badge (statuts)

---

## 7. Flux de Vente (User Flow Principal)

```
┌─────────────────────────────────────┐
│          ÉCRAN CAISSE               │
├─────────────────────────────────────┤
│                                     │
│   Stock actuel: 150 sacs            │
│   Prix unitaire: 5,000 FCFA         │
│                                     │
│   ┌───┐            ┌───┐            │
│   │ - │  Qté: 2    │ + │            │
│   └───┘            └───┘            │
│                                     │
│   ┌─────────┐  ┌─────────────┐      │
│   │💵Espèces│  │📱Mobile Money│      │
│   └─────────┘  └─────────────┘      │
│                                     │
│   Total: 10,000 FCFA                │
│                                     │
│   ┌─────────────────────────────┐   │
│   │     VALIDER LA VENTE        │   │
│   └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
           │
           ▼
    ✅ Vente enregistrée !
    Stock mis à jour: 148 sacs
```

---

## 8. Structure des Fichiers (Proposition)

```
src/
├── components/
│   ├── ui/              # Composants shadcn/ui
│   ├── layout/          # Header, Navigation, etc.
│   ├── sales/           # Composants module vente
│   ├── stock/           # Composants module stock
│   ├── reports/         # Composants rapports
│   └── admin/           # Composants administration
├── pages/
│   ├── Dashboard.tsx
│   ├── Sales.tsx
│   ├── Stock.tsx
│   ├── Reports.tsx
│   └── Admin.tsx
├── convex/
│   ├── schema.ts        # Schéma base de données
│   ├── products.ts      # Mutations/queries produits
│   ├── sales.ts         # Mutations/queries ventes
│   └── stockMovements.ts
├── lib/
│   ├── utils.ts
│   └── permissions.ts   # Helpers vérification rôles
├── hooks/
│   └── usePermissions.ts
└── App.tsx
```

---

## 9. Prochaines Étapes d'Implémentation

### Phase 1 - Fondations
1. Initialisation projet Vite + React + TypeScript
2. Configuration Tailwind CSS + shadcn/ui
3. Intégration Convex (schéma + fonctions de base)
4. Intégration Clerk (authentification + rôles)

### Phase 2 - Module Caisse (Priorité Haute)
5. Interface de vente tactile
6. Enregistrement des ventes
7. Mise à jour temps réel du stock

### Phase 3 - Module Stock
8. Vue stock actuel + alertes
9. Entrées de marchandise
10. Historique des mouvements

### Phase 4 - Module Rapports
11. Dashboard avec statistiques
12. Graphiques de tendances
13. Export CSV

### Phase 5 - Module Administration
14. Gestion des utilisateurs
15. Configuration prix et alertes

---

## Notes Techniques

### Convex
- Utiliser les subscriptions pour le temps réel (stock, ventes du jour)
- Indexer les ventes par date pour les rapports
- Mutations atomiques pour stock (éviter race conditions)

### Clerk
- Stocker le rôle dans `publicMetadata`
- Middleware pour protection des routes côté client
- Webhook optionnel pour sync utilisateurs

### Performance
- Pagination pour historiques longs
- Lazy loading des modules secondaires
- Cache côté client pour données peu volatiles

---

*Spécification générée via session de brainstorming - 27/01/2026*
*Prêt pour implémentation*
