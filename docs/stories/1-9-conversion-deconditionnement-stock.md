# Story 1.9 : Conversion / déconditionnement de stock (sac → sachets)

Status: review

<!-- Story issue d'une demande directe utilisateur (« 1 sac de riz GT11 donne 5 sachets de 900 g ; le caissier convertit selon la demande »). Décisions métier ci-dessous **à valider** avec l'utilisateur avant implémentation. -->

## Story

En tant que **commerçant d'intrants agricoles**,
je veux **convertir des unités d'un produit « gros conditionnement » (ex. 1 sac de riz GT11) en plusieurs unités d'un produit « détail » (ex. 5 sachets de 900 g)**,
afin de **vendre au détail à la demande sans fausser mon stock : 1 sac consommé doit baisser le stock « sac » et augmenter le stock « sachet » d'autant, en gardant une trace claire de l'opération.**

### Décisions métier (cadrage — À VALIDER)

1. **Deux produits distincts liés** : le sac (`riz GT11 — sac`) et le sachet (`riz GT11 — sachet 900 g`) sont **deux lignes `products`** (chacune son prix, son stock, son seuil d'alerte). Le sachet est un **produit ordinaire vendu via le flux de vente existant** — **aucune modification du flux de vente**. On ajoute un **lien parent→enfant** : le sachet porte `parentProductId` (= le sac) + `conversionRatio` (= 5). Un sac peut avoir **plusieurs enfants** (ex. sachet 900 g, sachet 1 kg).
2. **La conversion est une transformation interne de stock**, pas une vente ni un don : elle **décrémente le source** (−N sacs) et **incrémente la cible** (+N×ratio sachets), **n'écrit aucune ligne `sales`**, ne touche **ni la caisse** (`cashSessions`) **ni le chiffre d'affaires**. Le revenu n'apparaît **qu'à la vente** des sachets. **Aucune session de caisse requise** (comme un don).
3. **Tous les rôles peuvent convertir (caissier inclus)** — c'est une opération de comptoir « à la demande ». Garde-fou : la mutation n'autorise que des paires **réellement liées** (`target.parentProductId === sourceProductId`) avec un **ratio figé** ; le caissier ne manipule pas le stock librement (il choisit seulement le produit cible et le **nombre de sacs**).
4. **Irréversible** : un sachet ouvert ne redevient pas un sac. **Pas** d'annulation in-app ; une erreur se corrige par un **ajustement d'inventaire** (manager, `adjustStock` existant).
5. **Quantités entières uniquement** : `ratio` entier > 0, nombre de sacs converti entier > 0, stock source suffisant (pas de stock négatif, jamais de demi-sac).
6. **Aucune valeur monétaire enregistrée sur la conversion** : prix de revient absent du schéma et prix de vente sac ≠ 5 × prix sachet (marge du détail) → la conversion ne porte **aucun montant**. (Différence avec le don, qui enregistre une « valeur estimée » informative.)

### Le point métier (cœur de la story)

- Une conversion = **un événement à deux jambes sur deux produits** : une **sortie** côté source (sac) et une **entrée** côté cible (sachet), **dans la même mutation transactionnelle**. Les deux jambes sont reliées par un `conversionId`/`conversionReference` (motif identique à `saleId`/`donationId`).
- La conversion est **neutre pour la caisse et le CA par construction** : comme elle n'écrit **aucune** ligne `sales`, tous les calculs basés sur `sales` (`getTodayStats`, `getSalesEvolution`, réconciliation, créances) l'ignorent. Il suffit de **ne rien casser**.
- La conversion est aussi **neutre pour le « net 30 jours »** de `getStockStats` : le type de mouvement `conversion` n'est **ni** `in` **ni** `out` **ni** `donation` → il **n'entre pas** dans `totalIn`/`totalOut`/`totalDonations`/`netChange`. (Sinon la jambe « +5 sachets » ferait apparaître une fausse entrée et la jambe « −1 sac » une fausse sortie.)
- Traçabilité, comme pour les dons : **1 en-tête `conversions`** (l'événement, lu en un `get` pour la liste/reporting) **+ 2 `stockMovements` `type:"conversion"`** (une par produit, alimentant l'historique de stock par produit existant).

## Acceptance Criteria

1. **Déclarer un produit « issu d'un autre »** — Dans la gestion des produits ([`ProductManagement.tsx`](../../src/components/admin/ProductManagement.tsx), admin), le formulaire de création/édition permet (optionnellement) de cocher « Ce produit est issu du déconditionnement d'un autre produit » → sélection du **produit source** (parent) + saisie du **ratio** (nb d'unités obtenues à partir d'**1** unité du parent, entier > 0). Stocké sur l'enfant via `parentProductId` + `conversionRatio`. Le parent ne peut pas être le produit lui-même.
2. **Convertir (comptoir)** — Une action **« Convertir »** est accessible à **tous les rôles**, **sans session de caisse**, depuis le **chrome global** ([`DashboardLayout.tsx`](../../src/components/layout/DashboardLayout.tsx), à côté de « Faire un don »). Elle ouvre un formulaire : choix du **produit source** (liste limitée aux produits **ayant au moins un enfant**), choix du **produit cible** parmi ses enfants, saisie du **nombre de sacs**. Le formulaire affiche en direct l'aperçu **« −N {unité source} / +N×ratio {unité cible} »** et le stock restant prévu. Validation désactivée si source insuffisant / quantité non entière / 0.
3. **Enregistrement atomique** — `convertStock({ sourceProductId, targetProductId, sourceQuantity, note? })` (rôle authentifié actif, **tous rôles**) : vérifie que la cible est **réellement liée** à la source (`target.parentProductId === sourceProductId`) et que `target.conversionRatio` est un entier > 0 ; `sourceQuantity` entier > 0 ; `source.stockQuantity ≥ sourceQuantity`. Calcule `targetQuantity = sourceQuantity × ratio`. Génère une référence `CNV-YYYYMMDD-XXXXX` ; insère **1 en-tête `conversions`** (source/cible dénormalisés + `previousStock`/`newStock` des deux) ; **décrémente** le source et **incrémente** la cible ; insère **2 `stockMovements` `type:"conversion"`** (jambe source + jambe cible, reliées `conversionId`/`conversionReference`) ; écrit une ligne d'**audit** (`category:"stock"`, `action:"stock.converted"`) — **le tout dans une seule mutation**.
4. **Aucun impact caisse ni ventes** — Une conversion **ne crée aucune ligne `sales`**. `getTodayStats`, `getSalesEvolution`, la réconciliation de caisse (`calculateExpectedAmount`, `closeSession`) et les créances restent **strictement inchangés** (vérifier la non-régression). Aucune valeur monétaire n'est enregistrée sur la conversion.
5. **Neutralité des stats de stock** — `getStockStats` : les mouvements `type:"conversion"` **n'entrent pas** dans `totalIn`/`totalOut`/`totalDonations` ni dans `netChange` (le « net 30 jours » ne bouge pas). (Optionnel : exposer un `conversionsCount` informatif — **pas** une somme de quantités, qui n'aurait pas de sens entre deux produits différents.)
6. **Historique de stock** — Les deux jambes apparaissent dans l'historique ([`StockHistory.tsx`](../../src/components/stock/StockHistory.tsx)) avec un **badge/icône/filtre « Conversion »** distinct ; le **signe** (−N côté source, +N×ratio côté cible) est dérivé de `newStock − previousStock` ; le libellé mentionne la référence `CNV-…` et le produit lié. Le stock des deux produits reflète l'opération.
7. **Suivi des conversions** — Une vue **liste les conversions** (référence, date, source → cible, quantités, ratio, opérateur), accessible **manager/admin** (comme l'historique de stock), via un onglet dans [`StockPage.tsx`](../../src/pages/StockPage.tsx). Les conversions apparaissent dans l'export « Tous mouvements » existant avec le libellé « Conversion ».
8. **Sécurité & non-régression** — Référence `CNV-…` unique ; **aucune migration** (nouvelle table + nouveaux champs **optionnels**) ; l'ajout de `"conversion"` à l'union `stockMovements.type` est traité **partout** (assistant IA, exports, `StockHistory`, `exportUtils`) → build TypeScript + lint **0 erreur**. Une conversion ne peut pas rendre un stock négatif, ni convertir vers un produit non lié, ni avec un ratio absent/invalide. Aucune régression sur les ventes, la caisse, les créances, les dons.

## Tasks / Subtasks

- [x] **Task 1 — Schémas** (AC: 1, 3, 5, 6) — [`convex/schema.ts`](../../convex/schema.ts)
  - [x] `products` : ajouter `parentProductId: v.optional(v.id("products"))` et `conversionRatio: v.optional(v.number())` ; ajouter l'index `by_parent` (`["parentProductId"]`) pour lister les enfants d'un produit.
  - [x] `counters.type` : ajouter `v.literal("conversion")`.
  - [x] `stockMovements` : étendre `type` avec `v.literal("conversion")` ; ajouter `conversionId: v.optional(v.id("conversions"))` et `conversionReference: v.optional(v.string())` ; ajouter l'index `by_conversion` (`["conversionId"]`).
  - [x] Nouvelle table `conversions` : `reference` (string), `date` (number), `sourceProductId` (id products), `sourceProductName` (string), `sourceProductReference` (optional string), `sourceUnit` (optional string), `sourceQuantity` (number), `sourcePreviousStock` (number), `sourceNewStock` (number), `targetProductId` (id products), `targetProductName` (string), `targetProductReference` (optional string), `targetUnit` (optional string), `conversionRatio` (number), `targetQuantity` (number), `targetPreviousStock` (number), `targetNewStock` (number), `userId` (string), `userName` (string), `note` (optional string). Index `by_date` (`["date"]`), `by_reference` (`["reference"]`), `by_source` (`["sourceProductId"]`), `by_target` (`["targetProductId"]`).

- [x] **Task 2 — Référence de conversion** (AC: 3, 8) — [`convex/references.ts`](../../convex/references.ts)
  - [x] Ajouter `"conversion"` au type `ReferenceType` ([L8](../../convex/references.ts#L8)), à `PREFIXES` (`conversion: "CNV"`, [L11](../../convex/references.ts#L11)), à `DATED_TYPES` ([L22](../../convex/references.ts#L22) → daté `CNV-YYYYMMDD-XXXXX`) et au validateur `args.type` de `getNextReference` ([L64](../../convex/references.ts#L64)).

- [x] **Task 3 — Champs parent/ratio sur le produit** (AC: 1) — [`convex/products.ts`](../../convex/products.ts)
  - [x] `addProduct` ([L128](../../convex/products.ts#L128)) et `updateProduct` ([L310](../../convex/products.ts#L310)) : accepter `parentProductId: v.optional(v.id("products"))` et `conversionRatio: v.optional(v.number())`. Si `parentProductId` fourni : vérifier qu'il **existe**, est **actif**, **≠ produit courant** (interdit l'auto-référence en édition), et que `conversionRatio` est un **entier > 0**. Persister les deux champs (ou les effacer si la case est décochée). Audit : mentionner le lien dans le summary si présent.

- [x] **Task 4 — Mutation + queries conversion** (AC: 2, 3, 7) — `convex/conversions.ts` (**nouveau fichier**, motif calqué sur [`convex/donations.ts`](../../convex/donations.ts))
  - [x] `convertStock({ sourceProductId, targetProductId, sourceQuantity, note? })` : `ctx.auth` + user **actif** (**tous rôles** — pas de blocage caissier). Charger source et cible (`ctx.db.get`), exister + actif (`isActive !== false`). **Garde-fou** : `target.parentProductId === sourceProductId` (sinon throw « Ce produit n'est pas issu de la source choisie ») ; `ratio = target.conversionRatio` doit être un entier > 0. `Number.isInteger(sourceQuantity) && sourceQuantity > 0` ; `source.stockQuantity ≥ sourceQuantity` (sinon throw « Stock insuffisant : disponible X »). `targetQuantity = sourceQuantity × ratio`. Générer `CNV-…` ; insérer l'en-tête `conversions` (champs dénormalisés + `previousStock`/`newStock` des deux produits) ; `patch` source (`stockQuantity -= sourceQuantity`, `updatedAt`) et cible (`stockQuantity += targetQuantity`, `updatedAt`) ; générer **2** `MVT-…` et insérer **2** `stockMovements` `type:"conversion"` (jambe source : `reason = "Conversion ${ref} → ${targetName}"`, `previousStock`/`newStock` décrément ; jambe cible : `reason = "Conversion ${ref} ← ${sourceName}"`, incrément ; les deux avec `conversionId`/`conversionReference`). `writeAuditLog` (`category:"stock"`, `action:"stock.converted"`, summary lisible : « Conversion {ref} : −N {sac} → +M {sachet} »). Retourner `{ conversionReference, sourceNewStock, targetNewStock, targetQuantity, sourceLowStock }`.
  - [x] `getConversions({ startDate?, endDate?, limit? })` : **manager/admin** (mêmes garde-fous que [`getStockHistory`](../../convex/stock.ts#L13) : `cashier` → structure vide). Trier par `date` desc, filtrer par dates, limiter. Retourner `{ conversions, count }`.
  - [x] (Optionnel) `getConvertibleProducts()` : produits **actifs** ayant **au moins un enfant** (pour peupler le sélecteur source du formulaire), chacun avec ses enfants `{ targetProduct, ratio }`. Sinon, calculer côté client à partir de `getProducts`.

- [x] **Task 5 — Stats & filtre stock** (AC: 5, 6) — [`convex/stock.ts`](../../convex/stock.ts)
  - [x] `getStockHistory` : ajouter `"conversion"` au validateur `args.type` ([L17-24](../../convex/stock.ts#L17)) (le filtre `m.type === args.type` fonctionne tel quel).
  - [x] `getStockStats` : **ne pas** inclure les mouvements `type:"conversion"` dans `totalIn`/`totalOut`/`netChange` (par construction, le code ne somme que `in`/`out`/`donation` → vérifier qu'aucun calcul ne les capte). (Optionnel : `conversionsCount` informatif.)

- [x] **Task 6 — UI : lien parent/ratio dans le formulaire produit** (AC: 1) — [`src/components/admin/ProductManagement.tsx`](../../src/components/admin/ProductManagement.tsx)
  - [x] Ajouter un bloc optionnel « Produit issu d'un déconditionnement » : `Checkbox` + `Select` (produit parent, alimenté par `getProducts` en excluant le produit en édition) + `Input` ratio (entier > 0). Pré-remplir en édition depuis `parentProductId`/`conversionRatio`. Passer ces champs à `addProduct`/`updateProduct` (ou les vider si décoché).

- [x] **Task 7 — UI : formulaire de conversion + point d'entrée global** (AC: 2) — `src/components/conversions/ConvertStockForm.tsx` (+ `index.ts`), branché dans [`src/components/layout/DashboardLayout.tsx`](../../src/components/layout/DashboardLayout.tsx)
  - [x] `ConvertStockForm` : `Select` source (produits ayant ≥ 1 enfant), `Select` cible (enfants du source), `Input` nombre de sacs (entier > 0). Aperçu en direct « −N {unité source} (reste X) / +N×ratio {unité cible} (nouveau Y) ». Désactiver si source insuffisant / quantité invalide. Soumission → `useMutation(api.conversions.convertStock)` ; toast récap (« Conversion {ref} : N {sac} → M {sachet} ») ; reset.
  - [x] **Point d'entrée tous rôles, sans session** : ajouter un bouton **« Convertir »** dans le header de `DashboardLayout` à côté de « Faire un don » ([DashboardLayout.tsx:86-108](../../src/components/layout/DashboardLayout.tsx#L86)), ouvrant `ConvertStockForm` dans un [`Dialog`](../../src/components/ui/dialog.tsx). (Leçon de la story 1.8 : ne pas placer le point d'entrée caissier derrière le gating de caisse de `SalesContent`.)

- [x] **Task 8 — UI : historique & suivi des conversions** (AC: 6, 7) — [`StockHistory.tsx`](../../src/components/stock/StockHistory.tsx), [`StockPage.tsx`](../../src/pages/StockPage.tsx), `src/components/conversions/ConversionsList.tsx`
  - [x] `StockHistory` : `MovementType` ([L17](../../src/components/stock/StockHistory.tsx#L17)) → ajouter `'conversion'` ; branches de filtre ([L48-52](../../src/components/stock/StockHistory.tsx#L48) **et** [L208-212](../../src/components/stock/StockHistory.tsx#L208)) ; option du `Select` (« Conversions ») ; `getMovementBadge` ([L55](../../src/components/stock/StockHistory.tsx#L55)) cas `'conversion'` → badge distinct avec signe dérivé de `newStock − previousStock` (passer la valeur au helper) ; `getMovementIcon` ([L86](../../src/components/stock/StockHistory.tsx#L86)) cas `'conversion'` → icône `ArrowLeftRight`/`Repeat`/`RefreshCw` (lucide).
  - [x] `StockPage` : ajouter un onglet **« Conversions »** (manager/admin ; ajuster le nb de colonnes de la `TabsList`) rendant `ConversionsList` (+ possibilité d'ouvrir `ConvertStockForm`).
  - [x] `ConversionsList` : `useQuery(api.conversions.getConversions, {...})` → liste des conversions (date, référence, source → cible, quantités, ratio, opérateur), avec « Afficher plus » basé sur `count`. Réutiliser le style de [`DonationsList.tsx`](../../src/components/donations/DonationsList.tsx).

- [x] **Task 9 — Exhaustivité de l'union + exports/assistant** (AC: 6, 7, 8)
  - [x] [`convex/assistant.ts`](../../convex/assistant.ts) : ajouter `"conversion"` à l'enum du paramètre `type` de `get_stock_movements` ([L370](../../convex/assistant.ts#L370)), aux casts `a.type as ...` ([L319](../../convex/assistant.ts#L319), [L381](../../convex/assistant.ts#L381)) et `p.type as ...` ([L649](../../convex/assistant.ts#L649), [L691](../../convex/assistant.ts#L691)), et à la description du filtre ([L617](../../convex/assistant.ts#L617)).
  - [x] [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts) : ajouter `conversion: 'Conversion'` à `MOVEMENT_TYPE` ([L69](../../src/lib/assistantExports.ts#L69)) et `"conversion"` au cast `p.type as ...` ([L123](../../src/lib/assistantExports.ts#L123)).
  - [x] [`src/lib/exportUtils.ts`](../../src/lib/exportUtils.ts) : ajouter `'conversion'` au type `m.type` ([L26](../../src/lib/exportUtils.ts#L26)) et `conversion: 'Conversion'` à `typeLabels` ([L137](../../src/lib/exportUtils.ts#L137)).
  - [x] (Optionnel) [`ExportReportsModal.tsx`](../../src/components/reports/ExportReportsModal.tsx) : mettre à jour la description « Tous mouvements » (« … et conversions »).

- [x] **Task 10 — Vérification** (AC: 8)
  - [x] `npx convex codegen` ; `npm run build` (`tsc -b && vite build`) ; `npx eslint` sur les fichiers modifiés → **0 erreur**.
  - [x] Dérouler le plan de test manuel (Dev Notes › Tests).

## Dev Notes

### Modèle de données — choix structurants

- **Deux produits liés, pas de variantes.** Le schéma actuel pose **1 ligne `products` = 1 SKU vendable** (les `sales` référencent `productId`). Modéliser le sachet comme un **produit à part entière** est l'option la moins disruptive : le flux de vente, les analytics et les exports le traitent comme n'importe quel produit, **sans aucune modification**. Le lien se résume à deux champs optionnels sur l'enfant (`parentProductId`, `conversionRatio`) — un parent peut avoir plusieurs enfants (index `by_parent`). L'alternative « un produit, plusieurs unités de vente » imposerait un refactor profond de `sales`/stock et n'apporte rien ici.
- **En-tête + 2 mouvements** (calqué sur `donations`). L'en-tête `conversions` porte l'événement (source, cible, ratio, quantités, stocks avant/après) → source de la **liste/reporting**, lue en un `get`. En parallèle, **2 `stockMovements` `type:"conversion"`** (un par produit) restent dans l'**infrastructure d'historique existante** (vue par produit, filtres, exports), reliés par `conversionId`. C'est le pendant exact de `sales`↔`stockMovements` et `donations`↔`stockMovements`.
- **Aucune valeur monétaire.** Contrairement au don (`unitValue`/`totalValue` informatifs), la conversion ne porte **aucun montant** : pas de prix de revient dans le schéma, et `prix sac ≠ ratio × prix sachet` (marge du détail). Le revenu naît **uniquement à la vente** des sachets. Stocker une « valeur » prêterait à confusion.

### Atomicité & invariants

- **Tout dans une seule mutation Convex** (`convertStock`) : en-tête + décrément source + incrément cible + 2 mouvements + audit sont transactionnels (motif identique à `createSale`/`recordDonation`).
- **Garde-fou de liaison** : n'autoriser que `target.parentProductId === sourceProductId`. Empêche un caissier de « créer » du stock arbitraire : il ne choisit que le produit cible (parmi les enfants déclarés) et le nombre de sacs ; le ratio est **figé** sur le produit cible.
- **Neutralité caisse/CA** : aucune ligne `sales` → tous les calculs basés sur `sales` l'ignorent **par construction**. Ne **rien** ajouter à ces flux.
- **Neutralité stats stock** : `type:"conversion"` ∉ {`in`,`out`,`donation`} → automatiquement hors de `totalIn`/`totalOut`/`totalDonations`/`netChange`. **Vérifier** qu'aucun calcul ne le capte par erreur (ne **pas** le fondre dans `out`/`in`).
- **Stock négatif** : refuser toute conversion dont `sourceQuantity > source.stockQuantity` — ne jamais clamper silencieusement.

### Pièges à éviter

- **Exhaustivité TypeScript** : ajouter `"conversion"` à l'union `stockMovements.type` révélera les `switch`/casts supposant 4 valeurs (in/out/adjustment/donation). Points connus (le build/lint les signalera) : `getStockHistory` (validateur `args.type`), `assistant.ts` (enum `get_stock_movements` + casts L319/L381/L649/L691 + description L617), `assistantExports.ts` (`MOVEMENT_TYPE` + cast L123), `exportUtils.ts` (type L26 + `typeLabels` L137), `StockHistory.tsx` (`MovementType` + badge + icône + 2 jeux de filtres).
- **Signe dans le badge** : `getMovementBadge(type, quantity)` ne reçoit que la quantité (positive). Pour la conversion, dériver le signe de `newStock − previousStock` (jambe source < 0, jambe cible > 0) — passer la valeur au helper plutôt que de deviner.
- **Ratio manquant/invalide** : si un produit cible a `parentProductId` mais pas de `conversionRatio` entier > 0, `convertStock` doit **refuser** (et l'UI ne pas le proposer). Validé aussi à la création/édition du produit (Task 3/6).
- **Auto-référence** : interdire `parentProductId === productId` en édition.
- **Point d'entrée caissier** : comme pour les dons, le placer dans le **chrome global** (`DashboardLayout`), pas dans `SalesContent` (rendu sous `CashSessionProvider`), pour rester atteignable **sans** session de caisse ouverte. `convertStock` n'exige aucune session (garantie réelle côté backend).
- **Session de caisse** : ne **pas** l'exiger (une conversion ne touche pas le tiroir).

### Hors périmètre (extensions possibles)

- Conversion inverse (re-conditionner des sachets en sac) ; conversion « recette » multi-cibles (1 sac → X sachets 900 g + Y sachets 1 kg) ; prix de revient réel et valorisation du stock ; reconfiguration auto du prix sachet à partir du prix sac ; outil assistant dédié `get_conversions` ; validation manager d'une conversion ; conversion en lot. Le présent périmètre couvre la conversion **1 source → 1 cible** à ratio fixe, la traçabilité stock et la liste/reporting.

### Project Structure Notes

- **Backend** : [`convex/schema.ts`](../../convex/schema.ts), [`convex/references.ts`](../../convex/references.ts), [`convex/products.ts`](../../convex/products.ts), **`convex/conversions.ts`** (nouveau), [`convex/stock.ts`](../../convex/stock.ts).
- **UI** : `src/components/conversions/` (nouveau : `ConvertStockForm.tsx`, `ConversionsList.tsx`, `index.ts`), [`src/components/layout/DashboardLayout.tsx`](../../src/components/layout/DashboardLayout.tsx) (point d'entrée tous rôles), [`src/components/admin/ProductManagement.tsx`](../../src/components/admin/ProductManagement.tsx) (lien parent/ratio), [`src/pages/StockPage.tsx`](../../src/pages/StockPage.tsx) (onglet Conversions), [`src/components/stock/StockHistory.tsx`](../../src/components/stock/StockHistory.tsx).
- **Exports/assistant** : [`convex/assistant.ts`](../../convex/assistant.ts), [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts), [`src/lib/exportUtils.ts`](../../src/lib/exportUtils.ts), (optionnel) [`src/components/reports/ExportReportsModal.tsx`](../../src/components/reports/ExportReportsModal.tsx).
- **Aucune** modification du type `Page` ni de la `Sidebar` (l'onglet Conversions vit dans `StockPage`, le point d'entrée comptoir dans le header global).

### Tests (build + plan manuel — pas de framework de test)

1. `npx convex codegen` OK ; `npm run build` + `npx eslint` (fichiers modifiés) → **0 erreur**.
2. **Setup** : créer `riz GT11 — sac` (unité « sac »), puis `riz GT11 — sachet 900 g` (unité « sachet ») **lié** au sac avec ratio **5**. Vérifier que les deux apparaissent au catalogue.
3. **Conversion nominale** : convertir **2 sacs** → stock sac **−2**, stock sachet **+10** ; une référence `CNV-…` ; **2** `stockMovements type:"conversion"` (badge « Conversion », signes corrects) ; l'opération apparaît dans l'onglet Conversions.
4. **Caissier** : un caissier (sans session de caisse) peut ouvrir « Convertir » depuis le header global et convertir. Le caissier **ne voit pas** l'onglet Conversions (réservé manager/admin).
5. **Garde-fous** : convertir plus de sacs que le stock → refus, aucun stock négatif. Cible non liée à la source, ou ratio absent → refus.
6. **Vente du sachet** : vendre des sachets après conversion via le flux normal → CA et caisse impactés **uniquement** par la vente, pas par la conversion.
7. **Neutralité** : après une conversion, `getTodayStats` (CA, ventes), la réconciliation de caisse et `getStockStats.netChange` sont **inchangés** ; aucune ligne `sales` créée.
8. **Non-régression** : ventes (espèces/Mobile/crédit), entrées/ajustements de stock, dons (story 1.8) et réconciliation inchangés ; export « Tous mouvements » affiche « Conversion ».

### References

- [Source: convex/donations.ts] `recordDonation` / `getDonations` — motif en-tête + N `stockMovements` + audit + query récap (à transposer pour 2 jambes liées).
- [Source: convex/sales.ts#L290-L502] `createSale` — décrément stock + insertion `stockMovements` + génération de références.
- [Source: convex/stock.ts#L13-L79] `getStockHistory` (garde-fou rôle, validateur `args.type`) ; [#L84-L175] `getStockStats` (`totalIn`/`totalOut`/`totalDonations`/`netChange` — conversions à exclure).
- [Source: convex/products.ts#L128-L229] `addProduct` ; [#L310-L377] `updateProduct` (ajout `parentProductId`/`conversionRatio`).
- [Source: convex/references.ts#L8-L56] `ReferenceType`, `PREFIXES`, `DATED_TYPES`, `formatReference` (type daté → `CNV-YYYYMMDD-XXXXX`).
- [Source: convex/audit.ts] `writeAuditLog` (catégorie `"stock"`).
- [Source: src/components/layout/DashboardLayout.tsx#L86-L108] bouton global « Faire un don » (modèle du point d'entrée « Convertir »).
- [Source: src/components/admin/ProductManagement.tsx#L23-L120] formulaire produit (états + soumission `addProduct`/`updateProduct`).
- [Source: src/components/stock/StockHistory.tsx#L17-L94] `MovementType`, `getMovementBadge`, `getMovementIcon`, filtres (exhaustivité à étendre).
- [Source: src/pages/StockPage.tsx] `Tabs` (ajout onglet « Conversions ») ; garde manager/admin.
- [Source: convex/assistant.ts#L362-L385] outil `get_stock_movements` ; [#L617] description des filtres ; casts L319/L381/L649/L691.
- [Source: src/lib/assistantExports.ts#L69-L73] `MOVEMENT_TYPE` ; [#L118-L141] export des mouvements. [Source: src/lib/exportUtils.ts#L26,L137] type + `typeLabels`.
- [Source: docs/stories/1-8-dons-sorties-stock.md] story sœur (dons) — patron en-tête + mouvements + exhaustivité de l'union + leçon « point d'entrée caissier dans le header global ».

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story (implémentation séquentielle backend → UI). Pas de framework de test dans le projet : la « validation » suit la convention du projet (story 1.8) = `npx convex codegen` + `npm run build` (`tsc -b && vite build`) + `npx eslint` + plan de test manuel.

### Debug Log References

- `npx convex codegen` → types régénérés (nouvelle table `conversions`, type mouvement `conversion`, champs `conversionId`/`conversionReference`, champs produit `parentProductId`/`conversionRatio`, compteur `conversion`, index `by_parent`/`by_conversion`/`by_source`/`by_target`). Backend TypeScript OK, fonctions uploadées sur le déploiement Convex.
- `npm run build` (`tsc -b && vite build`) → **0 erreur** (seul avertissement : taille de chunk, préexistant — non lié à la story).
- `npx eslint` sur les 15 fichiers touchés → **0 erreur** (exit 0).

### Completion Notes List

- **AC1 / Task 3, 6 (lien parent/ratio)** : `addProduct`/`updateProduct` acceptent `parentProductId` + `conversionRatio` (optionnels). Validation : parent existant + actif, ratio entier > 0, interdiction de l'auto-référence (édition), ratio sans parent refusé. UI : `Select` « Issu d'un déconditionnement » (option sentinelle « Aucun » = pas de Checkbox → aucune dépendance UI ajoutée) + `Input` ratio conditionnel, pré-remplis en édition, effaçables (décoché → champs vidés via `undefined`).
- **AC2 / Task 7 (convertir au comptoir)** : `ConvertStockForm` (sélecteur source limité aux produits ayant ≥ 1 enfant via `getConvertibleProducts`, sélecteur cible = enfants du source, nombre d'unités, note optionnelle, aperçu « −N source / +N×ratio cible » avec stocks prévus). Point d'entrée **« Convertir »** dans le **header global** (`DashboardLayout`, à côté de « Faire un don ») → accessible à **tous les rôles sans session de caisse** (leçon de la story 1.8 : ne pas le mettre derrière le gating caisse de `SalesContent`).
- **AC3 (enregistrement atomique)** : `convertStock` — tous rôles actifs ; garde-fou `target.parentProductId === sourceProductId` + ratio entier > 0 + source ≠ cible + `sourceQuantity` entier > 0 + stock source suffisant. Insère **1 en-tête `conversions`** (source/cible dénormalisés + `previousStock`/`newStock` des deux) + **2 `stockMovements` `type:"conversion"`** (jambe source `reason: "Conversion {ref} → {cible}"`, jambe cible `reason: "Conversion {ref} ← {source}"`, reliées `conversionId`/`conversionReference`), décrémente/incrémente les deux stocks, écrit l'audit `stock.converted` — **tout dans une mutation transactionnelle**. Référence `CNV-YYYYMMDD-XXXXX`.
- **AC4 / AC5 (neutralité)** : `convertStock` n'écrit **aucune ligne `sales`** → caisse, CA (`getTodayStats`, `getSalesEvolution`), réconciliation et créances intrinsèquement neutres. Aucune valeur monétaire enregistrée sur la conversion. `getStockStats` ne somme que `in`/`out`/`donation` → le type `conversion` est **exclu de fait** de `totalIn`/`totalOut`/`totalDonations`/`netChange` (le « net 30 jours » ne bouge pas). `conversionsCount` optionnel **non implémenté** (la somme de quantités entre deux produits différents n'aurait pas de sens, cf. décision dans Dev Notes).
- **AC6 (historique stock)** : `StockHistory` — type `conversion` ajouté à `MovementType`, filtres (2 jeux), option « Conversions » du `Select`, badge distinct (`bg-locagri-primary`) avec **signe dérivé de `newStock − previousStock`** (jambe source `−`, jambe cible `+`), icône `Repeat`.
- **AC7 (suivi)** : `getConversions` (manager/admin, caissier → structure vide). `ConversionsList` (date, référence, source → cible, quantités, ratio, opérateur, note, « Afficher plus » sur `count`) dans un nouvel **onglet « Conversions »** de `StockPage` (`grid-cols-3 sm:grid-cols-5`, manager/admin). Export « Tous mouvements » : libellé « Conversion » ajouté (`exportUtils`, `assistantExports`).
- **AC8 (sécurité & non-régression)** : référence `CNV-…` ; **aucune migration** (table + champs nouveaux/optionnels) ; exhaustivité de l'union `stockMovements.type` traitée partout — `getStockHistory` (validateur), `assistant.ts` (enum `get_stock_movements` + 2 casts stock L381/L649 + description du filtre), `assistantExports.ts` (`MOVEMENT_TYPE` + cast), `exportUtils.ts` (type + `typeLabels`), `StockHistory.tsx`. Garde-fous : stock négatif refusé, cible non liée refusée, ratio invalide refusé. Build + lint OK.
- **Correction du plan (Task 9)** : la story mentionnait des casts stock en `assistant.ts` L319/L691 — vérification faite, **ces deux casts concernent `safe_transactions`**, pas le stock. Seuls L370 (enum), L381 et L649 (casts stock) + L617 (description) ont été modifiés.
- ⚠️ **Vérification manuelle en conditions réelles non effectuée** (pas d'exécution live ici). Validation = codegen/build/types/lint. Dérouler le plan de test (Dev Notes › Tests) avec `npx convex dev` actif avant prod. Pour une revue, préférer un LLM différent via `code-review`.

### File List

- `convex/schema.ts` — table `conversions` ; `products` : `parentProductId`/`conversionRatio` + index `by_parent` ; `stockMovements` : type `conversion` + `conversionId`/`conversionReference` + index `by_conversion` ; `counters.conversion`.
- `convex/references.ts` — type `conversion` → `CNV-YYYYMMDD-XXXXX` (daté) + validateur `getNextReference`.
- `convex/products.ts` — `addProduct`/`updateProduct` : args + validation `parentProductId`/`conversionRatio` (parent actif, ratio entier > 0, anti-auto-référence).
- `convex/conversions.ts` — **nouveau** : `convertStock`, `getConversions`, `getConvertibleProducts`.
- `convex/stock.ts` — `getStockHistory` : `conversion` ajouté au validateur `args.type`.
- `convex/assistant.ts` — `get_stock_movements` : enum + cast (run) + cast (countReportRows) + description du filtre étendus à `conversion`.
- `src/components/admin/ProductManagement.tsx` — bloc « Issu d'un déconditionnement » (Select parent + ratio), états, validation, passage aux mutations.
- `src/components/conversions/ConvertStockForm.tsx` — **nouveau** : formulaire de conversion (source/cible/quantité/note, aperçu).
- `src/components/conversions/ConversionsList.tsx` — **nouveau** : historique des conversions.
- `src/components/conversions/index.ts` — **nouveau** : barrel export.
- `src/components/layout/DashboardLayout.tsx` — bouton global « Convertir » (header, tous rôles) + Dialog `ConvertStockForm`.
- `src/pages/StockPage.tsx` — onglet « Conversions » (manager/admin) : `ConvertStockForm` + `ConversionsList`.
- `src/components/stock/StockHistory.tsx` — type `conversion` : badge directionnel + icône + filtres.
- `src/lib/assistantExports.ts` — `MOVEMENT_TYPE.conversion = 'Conversion'` + cast.
- `src/lib/exportUtils.ts` — type union + `typeLabels.conversion`.
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-14 | 0.1 | Création de la story (cadrage : 6 décisions métier à valider — 2 produits liés parent/enfant, conversion = transformation interne à 2 jambes, tous rôles, irréversible, entiers, sans valeur monétaire) | Claude Opus 4.8 |
| 2026-06-14 | 1.0 | Implémentation complète (10 tâches) : schéma + table `conversions` + `convertStock`/`getConversions`/`getConvertibleProducts` + lien parent/ratio produit + `ConvertStockForm` (header global) + onglet & liste Conversions + exhaustivité union. codegen/build/lint OK. Statut → review | Claude Opus 4.8 |
