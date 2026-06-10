# Story 1.1 : Tarification par type de client (particulier / grossiste)

Status: review

<!-- Projet brownfield sans artefacts BMad (pas de epics.md / sprint-status.yaml).
     Story construite à partir du code réel = source de vérité. Voir « References ». -->

## Story

**En tant que** caissier de la boutique Locagri,
**je veux** que le prix d'une vente dépende du type de client (prix fixe du produit pour un particulier, prix saisi librement pour un grossiste),
**afin de** vendre au tarif de gros négocié sur place tout en gardant un tarif catalogue contrôlé pour les particuliers.

## Contexte métier

- **Particulier** : achète au **prix du produit** défini dans la section Produit (comportement actuel, inchangé).
- **Grossiste** : le prix est **négocié au moment de l'achat** → le caissier **saisit librement le prix unitaire** lors de la vente.
- Un client sans type explicite, ou une vente **sans client**, est traité comme **particulier** (prix catalogue). C'est le défaut sûr : aucune vente ne doit appliquer un prix libre sans qu'un grossiste soit explicitement identifié.

## Acceptance Criteria

1. **Type de client** — Un client porte un type `particulier` ou `grossiste`. Tout client existant ou créé sans choix explicite est considéré `particulier` (défaut). Le champ est modifiable à la création et à l'édition.
2. **Section Produit inchangée** — Le `price` du produit reste le prix appliqué aux **particuliers**. Aucune modification de la logique de prix produit ([convex/products.ts](../../convex/products.ts), [ProductManagement.tsx](../../src/components/admin/ProductManagement.tsx)).
3. **Vente particulier / sans client** — Le prix unitaire appliqué = `product.price`, **non modifiable** dans l'interface. `total = product.price × quantité`. Comportement strictement identique à l'actuel.
4. **Vente grossiste** — Quand le client sélectionné est un grossiste, un champ **« Prix unitaire (FCFA) »** en saisie libre apparaît dans le panneau de vente. `total = prix_saisi × quantité`, recalculé en direct.
5. **Serveur source de vérité** — `convex/sales.ts › createSale` détermine le prix effectif côté serveur : il **ignore** tout prix transmis pour un particulier (utilise toujours `product.price`) et **exige** un prix `> 0` pour un grossiste. Un client malveillant ne peut pas imposer un prix libre sur un particulier.
6. **Intégrité + traçabilité du type** — La vente enregistre le `unitPrice` effectif et le `total` (déjà le cas). De plus, le **type du client est dénormalisé** sur la vente (`sales.clientType`) et une **colonne « Type client »** est ajoutée aux exports, afin d'analyser le CA particuliers vs grossistes. Historiques, stats du jour et graphiques restent corrects sans changement de calcul (ils somment `total`).
7. **Saisie du type aux 3 points d'entrée** — Le type est sélectionnable dans : (a) la création de client du `ClientSelector` (caisse), (b) la création de client de `ClientsPage`, (c) l'édition de client de `ClientsPage`. Un **badge** « Particulier » / « Grossiste » est affiché dans la liste des clients.
8. **Validations** — Prix grossiste = **entier strictement positif** (cohérent avec les prix FCFA saisis via `parseInt` dans le reste de l'app). Le bouton **« Valider la vente »** est désactivé tant qu'un grossiste est sélectionné sans prix valide saisi.
9. **Permissions inchangées** — Un caissier peut créer un client et enregistrer une vente (y compris saisir le prix de gros). L'**édition** d'un client (dont la requalification de type) reste réservée à manager/admin (règle actuelle de `updateClient`).
10. **Alerte prix anormal (non bloquante)** — Lors d'une vente grossiste, si le prix unitaire saisi s'écarte fortement du prix catalogue (`< price/5` ou `> price×5`, constante ajustable), afficher un `toast.warning` invitant à vérifier la saisie. La vente reste **autorisée** (pas de blocage).

## Tasks / Subtasks

- [x] **Tâche 1 — Schéma : type client + type dénormalisé sur la vente (AC: 1, 6)**
  - [x] Dans [convex/schema.ts](../../convex/schema.ts) table `clients`, ajouter `type: v.optional(v.union(v.literal("particulier"), v.literal("grossiste")))`. **Optionnel** pour rétro-compat et cohérence avec le pattern « optional + normalisation » du codebase (`unit`, `isActive`…).
  - [x] Dans la même table `sales`, ajouter `clientType: v.optional(v.union(v.literal("particulier"), v.literal("grossiste")))` (dénormalisé, optionnel pour les ventes legacy).
  - [ ] (Optionnel) `.index("by_type", ["type"])` sur `clients` uniquement si un filtrage par type est requis (sinon s'abstenir).

- [x] **Tâche 2 — Backend clients : accepter et exposer le type (AC: 1, 7)**
  - [x] [convex/clients.ts](../../convex/clients.ts) › `createClient` : ajouter l'arg `type: v.optional(v.union(v.literal("particulier"), v.literal("grossiste")))` et l'écrire à l'insert (défaut `"particulier"` si absent).
  - [x] `updateClient` : ajouter le même arg `type` et le patcher (conserver le garde-fou rôle existant : refus si `user.role === "cashier"`).
  - [x] `getClients` et `searchClients` : normaliser le type dans le `.map(...)` retourné (`type: c.type ?? "particulier"`), comme `unit ?? "sac"`. Cela fait remonter le type jusqu'au front.

- [x] **Tâche 3 — Backend ventes : prix effectif déterminé par le serveur (AC: 3, 5, 6, 8)**
  - [x] [convex/sales.ts](../../convex/sales.ts) › `createSale` : ajouter l'arg optionnel `unitPrice: v.optional(v.number())`.
  - [x] Charger le client (déjà chargé si `clientId`) et résoudre `clientType = client?.type ?? "particulier"`.
  - [x] Si `clientType === "grossiste"` : exiger `args.unitPrice` défini, **entier**, `> 0` (sinon `throw`). `effectiveUnitPrice = args.unitPrice`.
  - [x] Sinon (particulier / pas de client) : `effectiveUnitPrice = product.price` (ignorer tout `args.unitPrice` transmis).
  - [x] Remplacer `const total = product.price * args.quantity` (ligne ~360) par `const total = effectiveUnitPrice * args.quantity`, et `unitPrice: product.price` (ligne ~379) par `unitPrice: effectiveUnitPrice`. **Le calcul du stock et les mouvements restent inchangés.**
  - [x] À l'insert de la vente, écrire aussi `clientType` (le `clientType` résolu ci-dessus) pour la traçabilité (AC 6).

- [x] **Tâche 4 — Front caisse : champ prix libre pour grossiste (AC: 3, 4, 8, 10)**
  - [x] [ClientSelector.tsx](../../src/components/clients/ClientSelector.tsx) : étendre `onSelect` pour propager le **type** du client (ex. `onSelect(id, name, reference, type)`). ⚠️ La signature actuelle a déjà 3 params mais `QuickSalePanel` n'en lit que 2 — aligner proprement.
  - [x] [QuickSalePanel.tsx](../../src/components/dashboard/QuickSalePanel.tsx) : stocker `selectedClientType`. Si `grossiste`, afficher un `<Input>` « Prix unitaire (FCFA) » (état `customUnitPrice`), sinon le masquer.
  - [x] Calcul du total (ligne ~87) : `const unitPrice = isGrossiste ? Number(customUnitPrice) : product.price; const total = unitPrice * quantity`.
  - [x] `canSell` (ligne ~88) : ajouter la condition `(!isGrossiste || (Number.isInteger(customUnitPrice) && customUnitPrice > 0))`.
  - [x] **Alerte prix anormal (AC 10)** : dans `handleSale`, avant l'envoi, si grossiste et `unitPrice < product.price / 5 || unitPrice > product.price * 5` → `toast.warning('Prix inhabituel', { description: 'Vérifiez le montant saisi.' })`. **Non bloquant** : la vente continue. Extraire le facteur `5` dans une constante nommée (ex. `PRICE_ANOMALY_FACTOR`).
  - [x] `handleSale` : passer `unitPrice` à `createSale` uniquement si grossiste. Réinitialiser `customUnitPrice` après succès (comme `quantity`/`selectedClientId`).

- [x] **Tâche 5 — Front clients : sélecteur de type + badge (AC: 1, 7)**
  - [x] [ClientSelector.tsx](../../src/components/clients/ClientSelector.tsx) (dialog « Nouveau client ») : ajouter un choix Particulier/Grossiste (défaut Particulier), passé à `createClient`.
  - [x] [ClientsPage.tsx](../../src/pages/ClientsPage.tsx) : ajouter le choix de type au formulaire de **création** (`CreateClientDialog`, state `form` ~ligne 321) et au formulaire d'**édition** (`editTarget`).
  - [x] [ClientsPage.tsx](../../src/pages/ClientsPage.tsx) : afficher un **badge** du type dans la carte client (près du nom / quartier, ~lignes 249-261). Étendre le type local `ClientDoc` (~ligne 32) avec `type?`.

- [x] **Tâche 6 — Type client dans les exports (AC: 6)**
  - [x] [exportUtils.ts](../../src/lib/exportUtils.ts) : ajouter `clientType?` au type `SaleRow` (~l.12-16) et une colonne **« Type client »** dans `formatSalesForExport` (à côté de `'Client'`, ~l.74). Libellé `Grossiste` / `Particulier`, ou `-` si absent (ventes legacy). Le `clientType` remonte automatiquement via `getSalesHistory` (spread du doc) une fois les Tâches 1 et 3 faites.
  - [ ] (Optionnel) Afficher un badge type ou le `unitPrice` réel dans [RecentSales.tsx](../../src/components/dashboard/RecentSales.tsx) si utile au caissier.

- [x] **Tâche 7 — Vérification**
  - [x] `npx tsc -p convex/tsconfig.json --noEmit` (types backend) + `npm run build` (front) sans erreur.
  - [x] `npx convex deploy --yes` vers le backend self-hosted (schéma validé et déployé).
  - [ ] ⚠️ Test manuel **connecté** (login → grossiste → champ prix → vente) **non exécuté** : l'instance Clerk de dev n'a pas d'identifiants de test dans l'environnement. App vérifiée jusqu'à l'écran de connexion, sans erreur console. **À faire par {user_name} sur l'app déployée.**

## Dev Notes

### Modèle de données (Convex)

- Table `clients` actuelle : `reference, firstName?, lastName?, phone?, email?, quartier?, notes?, createdAt, createdById, createdByName, isActive`. **Aucun champ `type`** aujourd'hui. → On ajoute `type?` (union littérale).
- Base **neuve** (connectée le 2026-06-10) : un seul utilisateur admin, **aucun client** encore créé. Le champ peut donc être introduit sans migration de données. On le garde malgré tout **optionnel + normalisé** par cohérence avec tout le codebase (`unit ?? "sac"`, `isActive ?? true`).
- Table `sales` : stocke déjà `unitPrice` et `total` par ligne (donc les rapports qui somment `total` restent justes). On ajoute un seul champ dénormalisé `clientType?` pour la traçabilité/export ; le reste du calcul change uniquement dans `createSale`.

### Backend — point exact à modifier (source de vérité du prix)

Fichier [convex/sales.ts](../../convex/sales.ts), mutation `createSale` (~l.287-424). Logique actuelle :

```ts
const total = product.price * args.quantity;          // ~l.360
// ...
unitPrice: product.price,                              // ~l.379
```

Cible :

```ts
const clientType = client?.type ?? "particulier";     // client déjà chargé si clientId fourni (~l.347)
let effectiveUnitPrice: number;
if (clientType === "grossiste") {
  if (args.unitPrice === undefined || !Number.isInteger(args.unitPrice) || args.unitPrice <= 0) {
    throw new Error("Prix de gros invalide : saisissez un montant entier positif.");
  }
  effectiveUnitPrice = args.unitPrice;
} else {
  effectiveUnitPrice = product.price;                 // particulier / pas de client : prix catalogue, prix transmis ignoré
}
const total = effectiveUnitPrice * args.quantity;
// ... insert sales avec unitPrice: effectiveUnitPrice
```

⚠️ **Ne PAS** faire confiance au prix calculé côté front. Le serveur recalcule toujours `total` et choisit le prix selon le type.

### Patterns du codebase à respecter (anti-régression)

- **Auth/rôles** : chaque mutation charge l'utilisateur via `users.by_clerk_id` et vérifie `identity`. Reproduire ce pattern, ne pas l'inventer. `updateClient` refuse déjà les caissiers — conserver.
- **Prix = entiers FCFA** : `ProductManagement.tsx` utilise `parseInt(price)` et rejette `<= 0` ([ProductManagement.tsx:69-79](../../src/components/admin/ProductManagement.tsx)). Le champ prix grossiste doit suivre la même règle (entier `> 0`).
- **Formatage** : afficher les montants avec `new Intl.NumberFormat('fr-FR')` (présent partout, ex. `formatPrice`).
- **Unions littérales** : suivre le style existant (`role`, `paymentMethod`, `status`) — `v.union(v.literal(...), v.literal(...))`.
- **Champs optionnels legacy** : normaliser à la lecture dans les `.map(...)` des queries (`type: c.type ?? "particulier"`).
- **Toasts** : `sonner` (`toast.success`/`toast.error`) pour les retours utilisateur, déjà la convention.
- **Couleurs** : vert `#016124` (principal), `#7ABE4E` (accent), `#CF761C` (mobile/alerte). Réutiliser pour le badge/champ grossiste.

### Notes sur la structure projet

- Backend Convex : un fichier par domaine dans `convex/` (`clients.ts`, `sales.ts`, `products.ts`). Mettre la logique au bon endroit, ne pas créer de nouveau module.
- Front : pages dans `src/pages/`, composants par domaine dans `src/components/<domaine>/` avec un `index.ts` de ré-export. Respecter les `index.ts` existants.
- Le **flux de vente réel** est dans [QuickSalePanel.tsx](../../src/components/dashboard/QuickSalePanel.tsx) (et non dans `src/components/sales/`, qui ne contient que `ProductSetup` et `TodayStats`). `SalesPage` monte `QuickSalePanel` via l'onglet « Ventes ».
- Le `ClientSelector` est partagé : utilisé dans la caisse. Toute modif de sa signature `onSelect` impacte `QuickSalePanel` — vérifier les deux.

### Testing

Pas de framework de test automatisé dans le repo (aucun script `test`, pas de Vitest/Jest). **Vérification manuelle** après `npx convex deploy` + `npm run dev` :

1. **Particulier (régression)** : vente sans client → prix = prix produit, total correct, pas de champ prix libre. Idem avec un client `particulier`.
2. **Grossiste** : créer/sélectionner un grossiste → le champ « Prix unitaire » apparaît ; total = prix saisi × quantité ; « Valider » désactivé tant que prix vide/0.
3. **Sécurité serveur** : appeler `createSale` avec un `unitPrice` farfelu sur un particulier → le serveur applique quand même `product.price` (le prix transmis est ignoré).
4. **Validation** : grossiste avec prix `0` ou négatif → erreur, pas de vente créée, stock inchangé.
5. **Stock & rapports** : après une vente grossiste, le stock décrémente correctement et l'historique/stats affichent le bon `total`.
6. Vérifs techniques : `npx tsc -p convex/tsconfig.json --noEmit` et `npm run build` passent.

### References

- [convex/schema.ts](../../convex/schema.ts) — tables `clients` (l.24-43) et `sales` (l.67-92), champ `unitPrice`/`total` déjà présents.
- [convex/sales.ts](../../convex/sales.ts) — `createSale`, calcul du prix l.360 / l.379 (point de modification central).
- [convex/clients.ts](../../convex/clients.ts) — `createClient` (l.147), `updateClient` (l.229, refus caissier l.248), `getClients`/`searchClients` (normalisation).
- [convex/products.ts](../../convex/products.ts) — `price` produit = prix particulier (inchangé).
- [src/components/dashboard/QuickSalePanel.tsx](../../src/components/dashboard/QuickSalePanel.tsx) — UI de vente, total l.87, `canSell` l.88, `handleSale` l.44.
- [src/components/clients/ClientSelector.tsx](../../src/components/clients/ClientSelector.tsx) — sélection + dialog création (`onSelect` l.28, form l.41).
- [src/pages/ClientsPage.tsx](../../src/pages/ClientsPage.tsx) — liste, création (`form` l.321), édition (`editTarget`), badge à ajouter (~l.249-261).
- [src/components/admin/ProductManagement.tsx](../../src/components/admin/ProductManagement.tsx) — convention prix entier `> 0`.
- [src/lib/exportUtils.ts](../../src/lib/exportUtils.ts) — colonnes export (`unitPrice`, `total`, `clientName`).
- Infra : backend Convex self-hosted `https://pdv-convex-api.locagri-app.com`, déploiement via `npx convex deploy --yes` (voir mémoire projet « Stack infra PDV »).

## ✅ Décisions confirmées (2026-06-10) — toutes tranchées, rien de bloquant

1. **Prix libre = prix unitaire** (× quantité), `total = unitPrice × quantité`. Cohérent avec le schéma `sales` existant. → AC 4, Tâche 4.
2. **Déclencheur = client grossiste sélectionné uniquement.** Le champ prix libre n'apparaît **que** si un client de type `grossiste` est choisi ; une vente sans client reste au prix catalogue. **Pas** d'interrupteur « Grossiste » ponctuel. → AC 3-4, Tâche 4.
3. **Garde-fou = alerte non bloquante si prix anormal.** Pas de blocage ni de prix plancher. Quand le prix de gros saisi s'écarte fortement du prix catalogue (probable faute de frappe, ex. un zéro en trop/manquant), afficher un `toast.warning` ; la vente reste possible. Heuristique : alerter si `unitPrice < product.price / 5` **ou** `unitPrice > product.price × 5` (constante ajustable, ne déclenche pas sur une remise de gros normale). → AC 10, Tâche 4.
4. **Type tracé sur la vente.** Dénormaliser `clientType` sur la table `sales` + ajouter une colonne « Type client » aux exports, pour analyser le CA particuliers vs grossistes. → AC 6, Tâches 1, 3, 6.
5. **Édition du type = manager/admin seulement.** Un caissier fixe le type à la **création** du client uniquement ; la requalification d'un client existant reste réservée à manager/admin (règle actuelle de `updateClient` conservée). → AC 9.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context) — `claude-opus-4-8[1m]`

### Debug Log References

- `npx tsc -p convex/tsconfig.json --noEmit` → 0 erreur
- `npm run build` (`tsc -b` + `vite build`) → build OK (bundle généré)
- `npx convex deploy --yes` → « Schema validation complete », fonctions déployées sur `https://pdv-convex-api.locagri-app.com`
- Preview Vite (worktree, port 5174) → écran de connexion rendu, **0 erreur console**

### Completion Notes List

- **Backend prix (cœur)** : `createSale` résout `clientType = client?.type ?? "particulier"` et calcule `effectiveUnitPrice` — grossiste = `args.unitPrice` (entier `> 0` exigé, sinon `throw`), sinon `product.price`. Tout prix transmis pour un particulier est **ignoré** → serveur = seule source de vérité (AC 5). `total` et `unitPrice` de la vente utilisent ce prix effectif ; `clientType` dénormalisé sur la vente (AC 6). Stock/mouvements inchangés.
- **Type client** : champ `type` (optionnel, normalisé `?? "particulier"`) sur `clients`, accepté par `createClient`/`updateClient` (édition préserve le type existant si non fourni), exposé par `getClients`/`searchClients`. `updateClient` conserve le refus caissier (AC 9).
- **Caisse** : `QuickSalePanel` capte le type via `onSelect` (signature `ClientSelector` étendue à 4 args), affiche le champ « Prix unitaire grossiste » seulement si grossiste, recalcule le total, désactive « Valider » tant que le prix est invalide (AC 3-4, 8), et émet un `toast.warning` non bloquant si le prix s'écarte de plus d'un facteur `PRICE_ANOMALY_FACTOR = 5` du prix catalogue (AC 10).
- **Clients** : sélecteur de type (composant local `ClientTypeToggle` réutilisé) dans les formulaires création/édition de `ClientsPage` et le dialog de création de `ClientSelector` ; badge « Particulier/Grossiste » dans la liste (AC 1, 7).
- **Exports** : colonne « Type client » ajoutée à `formatSalesForExport` ; `clientType` remonte automatiquement via `getSalesHistory` (aucun changement d'appelant).
- **Adaptation TDD** : aucun framework de test dans le repo ; ajouter Vitest/Jest aurait été une dépendance hors périmètre. Vérification faite par typecheck + build + déploiement + chargement preview (cf. Debug Log).
- **Sous-tâches optionnelles non faites (volontaire)** : index `by_type` sur `clients` (pas de filtrage requis) ; affichage du type/`unitPrice` dans `RecentSales` (confort, non requis par les AC).
- **Reste à faire par l'utilisateur** : test fonctionnel connecté sur l'app déployée (non réalisable ici, instance Clerk dev sans identifiants de test).

### File List

Code (relatifs à la racine du repo) :
- `convex/schema.ts` — `clients.type` + `sales.clientType`
- `convex/clients.ts` — arg `type` (create/update) + normalisation (get/search)
- `convex/sales.ts` — prix effectif serveur + `clientType` dénormalisé
- `src/components/dashboard/QuickSalePanel.tsx` — champ prix grossiste + alerte + envoi `unitPrice`
- `src/components/clients/ClientSelector.tsx` — `onSelect` + type à la création
- `src/pages/ClientsPage.tsx` — `ClientTypeToggle`, badge, formulaires
- `src/lib/exportUtils.ts` — colonne « Type client »

Docs / outillage :
- `docs/stories/1-1-tarification-type-client.md` — cette story
- `.claude/launch.json` — config preview du worktree (vérification uniquement)
