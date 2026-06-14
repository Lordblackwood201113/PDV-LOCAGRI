# Story 1.8 : Dons — sorties de stock sans encaissement

Status: review

<!-- Story issue d'une demande directe utilisateur. Décisions métier validées via questions de cadrage (voir ci-dessous). -->

## Story

En tant que **commerçant d'intrants agricoles**,
je veux **enregistrer des dons (sorties de stock sans encaissement) en notant qui, dans l'entreprise, effectue le don et pourquoi**,
afin de **tracer les produits offerts (démonstrations, échantillons, gestes commerciaux, dons à des coopératives/associations) sans fausser ma caisse ni mon chiffre d'affaires, et savoir combien j'ai donné.**

### Décisions métier validées (cadrage)

1. **Don multi-produits (panier)** : un don = un **en-tête** (donneur + motif + date) regroupant **plusieurs lignes produits**. C'est un « bon de don » (table `donations`). Chaque ligne produit génère aussi un `stockMovements` (traçabilité stock par produit).
2. **Tous les rôles** peuvent enregistrer un don (**caissier inclus**). **Aucune session de caisse requise** : un don ne touche pas le tiroir (aucun argent ne rentre ni ne sort de la caisse).
3. **Valeur estimée enregistrée** au **prix catalogue** du produit au moment du don (dénormalisée, `unitValue`/`lineValue`/`totalValue`). Purement **informative** (reporting « X FCFA donnés ») — n'entre **jamais** en caisse ni dans le chiffre d'affaires.
4. **« Personne de l'entreprise qui effectue le don »** = champ texte **obligatoire** (`donorName`), **distinct** du caissier connecté (lui est déjà tracé via `userId`/`userName`). **Motif optionnel** (`motif`). On n'enregistre **pas** de bénéficiaire (hors périmètre — extension possible).
5. **Stock suffisant obligatoire** : on ne peut pas donner plus que le stock disponible (par produit, agrégé si un produit apparaît deux fois dans le panier).

### Le point métier (cœur de la story)

- Un **don décrémente le stock** comme une vente, mais **n'encaisse rien** : il **n'écrit aucune ligne `sales`**, ne touche **ni** la caisse (`cashSessions` / `expectedAmount` / réconciliation) **ni** le chiffre d'affaires (`getTodayStats`, graphiques, rapports de ventes). Comme aucune vente n'est créée, ces flux sont **intrinsèquement neutres** : il suffit de **ne rien casser**.
- La **traçabilité** passe par deux écritures complémentaires, dans **la même mutation transactionnelle** :
  - 1 **en-tête `donations`** (l'événement : donneur, motif, lignes, valeur totale) → alimente la **liste des dons** et le **reporting**.
  - N **`stockMovements` de type `donation`** (un par ligne) → alimente l'**historique de stock** existant (par produit), reliés à l'en-tête via `donationId`/`donationReference` (motif identique à `saleId`/`saleReference`).

## Acceptance Criteria

1. **Faire un don (panier)** — Une action « Faire un don » est accessible à **tous les rôles** depuis l'espace Ventes ([`SalesPage.tsx`](../../src/pages/SalesPage.tsx)), ouvrant un formulaire panier : ajout/suppression de **lignes produit + quantité**, saisie du **donneur** (obligatoire) et d'un **motif** (optionnel). Le formulaire affiche la **valeur totale estimée** en temps réel. **Aucune session de caisse n'est requise.**
2. **Validation des données** — La soumission exige : `donorName` non vide (sinon erreur claire), **au moins une ligne**, et pour chaque ligne `quantity` **entière > 0** avec un produit **actif** existant. Le **stock doit être suffisant par produit** (validation sur la quantité **cumulée** si le même produit apparaît plusieurs fois) → sinon erreur explicite « Stock insuffisant pour {produit} : disponible X ».
3. **Enregistrement atomique** — `recordDonation({ donorName, motif?, items: [{ productId, quantity }] })` (rôle authentifié actif, **tous rôles**) : génère une référence `DON-YYYYMMDD-XXXXX`, insère **1 en-tête `donations`** (avec lignes dénormalisées + totaux), **décrémente le stock** de chaque produit, insère **1 `stockMovements` `type:"donation"` par ligne** (relié `donationId`/`donationReference`), le tout dans **une seule mutation**. Écrit une ligne d'**audit** (`category:"stock"`, `action:"stock.donated"`).
4. **Valeur estimée** — Chaque ligne enregistre `unitValue = product.price` (prix catalogue au moment du don) et `lineValue = unitValue × quantity` ; l'en-tête enregistre `totalValue = Σ lineValue`, `totalQuantity = Σ quantity`, `itemCount = nombre de lignes`. Cette valeur est **informative** : elle **n'apparaît ni** dans la caisse **ni** dans le chiffre d'affaires.
5. **Aucun impact caisse ni ventes** — Un don **ne crée aucune ligne `sales`**. `getTodayStats` (CA, ventes espèces/Mobile/crédit), `getSalesEvolution`, la réconciliation de caisse (`calculateExpectedAmount`, `closeSession`) et les rapports de ventes restent **strictement inchangés** pour les dons. (Vérifier la non-régression.)
6. **Historique de stock** — Les lignes de don apparaissent dans l'historique des mouvements ([`StockHistory.tsx`](../../src/components/stock/StockHistory.tsx)) avec un **badge/icône/filtre « Don »** distinct (sortie), le **motif** + **donneur** lisibles dans le libellé. `getStockStats` compte les dons comme une **sortie** : nouveau total `totalDonations` et `netChange = totalIn − totalOut − totalDonations` (cohérence du « net 30 jours »).
7. **Suivi des dons** — Une vue **liste les dons** (en-tête : référence, date, donneur, motif, nb d'articles, **valeur totale**) avec le **total des dons de la période** (« X FCFA donnés »), accessible **manager/admin** (comme l'historique de stock). Les dons sont **exportables** (au minimum via l'export « Tous mouvements » existant, qui doit afficher le libellé « Don »).
8. **Sécurité & non-régression** — Référence `DON-…` unique ; **aucune migration** (nouvelle table + nouveaux champs optionnels) ; l'ajout de `"donation"` à l'union `stockMovements.type` est traité **partout** (assistant IA, exports, `StockHistory`) → build TypeScript + lint **0 erreur**. Un don ne peut pas rendre un stock négatif. Aucune régression sur les ventes, la caisse, les créances.

## Tasks / Subtasks

- [x] **Task 1 — Schémas** (AC: 3, 4, 6) — [`convex/schema.ts`](../../convex/schema.ts)
  - [x] `counters.type` : ajouter `v.literal("donation")`.
  - [x] `stockMovements` : étendre `type` avec `v.literal("donation")` ; ajouter `donationId: v.optional(v.id("donations"))` et `donationReference: v.optional(v.string())` ; ajouter l'index `by_donation` (`["donationId"]`).
  - [x] Nouvelle table `donations` : `reference` (string), `date` (number), `donorName` (string), `motif` (optional string), `items` (`v.array(v.object({ productId: v.id("products"), productName: v.string(), productReference: v.optional(v.string()), quantity: v.number(), unitValue: v.number(), lineValue: v.number(), previousStock: v.number(), newStock: v.number() }))`), `totalQuantity` (number), `totalValue` (number), `itemCount` (number), `userId` (string), `userName` (string). Index `by_date` (`["date"]`) et `by_reference` (`["reference"]`).

- [x] **Task 2 — Référence de don** (AC: 3, 8) — [`convex/references.ts`](../../convex/references.ts)
  - [x] Ajouter `"donation"` au type `ReferenceType` ([L8](../../convex/references.ts#L8)), à `PREFIXES` (`donation: "DON"`, [L11](../../convex/references.ts#L11)), à `DATED_TYPES` ([L21](../../convex/references.ts#L21) → daté `DON-YYYYMMDD-XXXXX`) et au validateur `args.type` de `getNextReference` ([L63](../../convex/references.ts#L63)).

- [x] **Task 3 — Mutation + queries dons** (AC: 1, 2, 3, 4, 7) — `convex/donations.ts` (**nouveau fichier**, motif calqué sur [`convex/sales.ts`](../../convex/sales.ts) et [`convex/clients.ts`](../../convex/clients.ts))
  - [x] `recordDonation({ donorName, motif?, items })` : `ctx.auth` + user **actif** (tous rôles — **pas** de blocage caissier) ; `donorName.trim()` non vide ; `items.length ≥ 1`. **Agréger** les lignes par `productId` (cumuler les quantités) avant validation. Pour chaque produit : `ctx.db.get`, exister + actif (`isActive !== false`), `Number.isInteger(qty) && qty > 0`, `product.stockQuantity ≥ qtyCumulée` (sinon throw explicite). Calculer `unitValue = product.price`, `lineValue`, totaux. Générer `DON-…` ; insérer l'en-tête `donations` (items dénormalisés + `previousStock`/`newStock` par ligne) ; pour chaque produit : `ctx.db.patch(stockQuantity -= qty, updatedAt)` puis générer `MVT-…` et insérer `stockMovements` `type:"donation"` (`reason` = `Don ${donationReference} — ${donorName}${motif ? " (" + motif + ")" : ""}`, `donationId`, `donationReference`). `writeAuditLog` (`category:"stock"`, `action:"stock.donated"`, summary lisible avec nb d'articles, qté totale, valeur estimée, donneur). Retourner `{ donationReference, totalQuantity, totalValue, itemCount, lowStockProducts }`.
  - [x] `getDonations({ startDate?, endDate?, limit? })` : **manager/admin** (mêmes garde-fous que [`getStockHistory`](../../convex/stock.ts#L13) : `cashier` → `[]`). Trier par `date` desc, filtrer par dates, limiter. Retourner `{ donations, totalValue, totalQuantity, count }` (motif identique à [`getReceivables`](../../convex/clients.ts)).

- [x] **Task 4 — Statistiques & filtre stock** (AC: 5, 6) — [`convex/stock.ts`](../../convex/stock.ts)
  - [x] `getStockHistory` : ajouter `"donation"` au validateur `args.type` ([L17-19](../../convex/stock.ts#L17)) (le filtre `m.type === args.type` fonctionne tel quel).
  - [x] `getStockStats` : ajouter `totalDonations = Σ quantity (type "donation")` ([près de L132-138](../../convex/stock.ts#L132)) ; **inclure les dons dans `netChange`** : `netChange = totalIn − totalOut − totalDonations`. Exposer `totalDonations` dans `last30Days`. (Ne **pas** les fondre dans `totalOut` pour garder « Ventes » et « Dons » distincts.)

- [x] **Task 5 — UI formulaire de don (panier) + point d'entrée** (AC: 1, 2, 4) — `src/components/donations/DonationForm.tsx` (+ `index.ts`), branché dans [`src/pages/SalesPage.tsx`](../../src/pages/SalesPage.tsx)
  - [x] `DonationForm` (réutilisable) : liste de lignes `{ productId, quantity }` (ajout/suppression), sélection produit via `useQuery(api.products.getProducts)` affichant le stock dispo, champ **donneur** (obligatoire), champ **motif** (optionnel), **total estimé** calculé en direct (Σ `product.price × qty`). Désactiver la validation si donneur vide / 0 ligne / quantité invalide ou > stock. Soumission → `useMutation(api.donations.recordDonation)` ; toast récap (« Don {ref} — N article(s), ~{valeur} FCFA enregistré ») ; reset.
  - [x] **Point d'entrée tous rôles** : dans `SalesContent` ([`SalesPage.tsx:62`](../../src/pages/SalesPage.tsx#L62)), ajouter un bouton **« Faire un don »** (près de [`QuickSalePanel`](../../src/components/dashboard/QuickSalePanel.tsx), [L128](../../src/pages/SalesPage.tsx#L128)) ouvrant `DonationForm` dans un [`Dialog`](../../src/components/ui/dialog.tsx). **Pas** de garde de rôle, **pas** de session de caisse requise.

- [x] **Task 6 — Affichage des dons dans l'historique** (AC: 6) — [`src/components/stock/StockHistory.tsx`](../../src/components/stock/StockHistory.tsx)
  - [x] `MovementType` ([L17](../../src/components/stock/StockHistory.tsx#L17)) : ajouter `'donation'`. Ajouter la branche de filtre ([L46-52](../../src/components/stock/StockHistory.tsx#L46) **et** [L196-202](../../src/components/stock/StockHistory.tsx#L196)) et l'option du `Select` ([L144-149](../../src/components/stock/StockHistory.tsx#L144), libellé « Dons »).
  - [x] `getMovementBadge` ([L54](../../src/components/stock/StockHistory.tsx#L54)) : cas `'donation'` → badge distinct (ex. ambre/violet) « -{quantity} Don ». `getMovementIcon` ([L79](../../src/components/stock/StockHistory.tsx#L79)) : cas `'donation'` → icône `Gift` ou `HeartHandshake` (lucide).

- [x] **Task 7 — Vue Suivi des dons** (AC: 7) — [`src/pages/StockPage.tsx`](../../src/pages/StockPage.tsx) + `src/components/donations/DonationsList.tsx`
  - [x] `StockPage` : ajouter un onglet **« Dons »** (visible **manager/admin** ; passer `grid-cols-3` → `grid-cols-4` dans la `TabsList` [L51](../../src/pages/StockPage.tsx#L51)). L'onglet rend `DonationsList` (+ possibilité d'ouvrir `DonationForm`).
  - [x] `DonationsList` : `useQuery(api.donations.getDonations, {...})` → carte récap **« Total des dons »** (valeur + nb) + liste des en-têtes (date, donneur, motif, articles, valeur totale). Réutiliser le style de [`StockHistory`](../../src/components/stock/StockHistory.tsx) / `RecordPaymentDialog`.

- [x] **Task 8 — Exhaustivité de l'union + exports/assistant** (AC: 6, 7, 8)
  - [x] [`convex/assistant.ts`](../../convex/assistant.ts) : ajouter `"donation"` à l'enum du paramètre `type` de `get_stock_movements` ([L370](../../convex/assistant.ts#L370)), aux casts `a.type as ...` ([L382](../../convex/assistant.ts#L382)) et `p.type as ...` ([L648](../../convex/assistant.ts#L648)), et à la description du filtre ([L617](../../convex/assistant.ts#L617)).
  - [x] [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts) : ajouter `donation: 'Don'` à `MOVEMENT_TYPE` ([L69](../../src/lib/assistantExports.ts#L69)) et `"donation"` au cast `p.type as ...` ([L123](../../src/lib/assistantExports.ts#L123)).
  - [x] (Optionnel) [`ExportReportsModal.tsx`](../../src/components/reports/ExportReportsModal.tsx) : ajouter un export dédié « Dons » (`type:'donation'`). L'export « Tous mouvements » ([L110-115](../../src/components/reports/ExportReportsModal.tsx#L110)) inclut déjà les dons une fois le libellé `MOVEMENT_TYPE` ajouté.

- [x] **Task 9 — Vérification** (AC: 8)
  - [x] `npx convex codegen` ; `npm run build` (`tsc -b && vite build`) ; `npx eslint` sur les fichiers modifiés → **0 erreur**.
  - [x] Dérouler le plan de test manuel (Dev Notes › Tests).

## Dev Notes

### Modèle de données — choix structurants

- **En-tête + lignes embarquées + mouvements par ligne.** L'en-tête `donations` porte l'événement (donneur, motif, totaux) **et** une copie dénormalisée des lignes (`items`) — c'est la source du « bon de don » et du reporting, lue en **un seul `get`**. En parallèle, **chaque ligne** crée un `stockMovements` `type:"donation"` pour rester dans l'**infrastructure d'historique de stock existante** (vue par produit, filtres, exports). Cette double écriture est le pendant de `sales` ↔ `stockMovements` (une vente = un mouvement ; un don = N mouvements, regroupés par `donationId`).
- **Valeur dénormalisée au prix catalogue.** `unitValue = product.price` est **figé au moment du don** (comme `unitPrice` sur `sales`) → l'historique reste juste même si le prix change ensuite. Aucun « prix de revient » n'existe dans le schéma → la valeur est une **estimation au prix de vente**, explicitement informative.
- **`donorName` ≠ caissier.** Le caissier connecté est déjà tracé (`userId`/`userName`, et l'audit). `donorName` capture **la personne de l'entreprise qui décide/effectue le don** (souvent le patron/responsable), saisie librement à chaque don. Les deux sont conservés.

### Atomicité & invariants

- **Tout dans une seule mutation Convex** (`recordDonation`) : en-tête + décréments de stock + N mouvements + audit sont transactionnels (cohérence garantie, motif identique à `createSale`).
- **Agrégation par produit avant validation** : si le panier contient deux fois le même produit, valider et décrémenter sur la **somme** des quantités, sinon on pourrait passer le stock sous zéro (deux lignes validées séparément contre le même stock initial). **Stocker le panier agrégé : une entrée `items` (et un `stockMovements`) par produit distinct** → un seul décrément par produit, `previousStock`/`newStock` non ambigus. (Si l'UI laisse saisir deux lignes du même produit, les fusionner côté serveur avant insertion.)
- **Neutralité caisse/CA** : un don n'écrit **aucune** ligne `sales` → tous les calculs basés sur `sales` (CA, stats de paiement, réconciliation, créances) l'ignorent **par construction**. Ne **rien** ajouter à ces flux.

### Pièges à éviter

- **Exhaustivité TypeScript** : ajouter `"donation"` à l'union `stockMovements.type` peut révéler des `switch`/casts supposant 3 valeurs. Points connus à traiter (le build/lint les signalera) : `getStockHistory` (validateur `args.type`), `assistant.ts` (enum + 2 casts + description), `assistantExports.ts` (`MOVEMENT_TYPE` + cast), `StockHistory.tsx` (`MovementType` + badge + icône + filtres). `ExportReportsModal` utilise des littéraux `'in'`/`'out'` `as const` → pas cassé, mais l'export « Tous mouvements » affichera `donation` brut sans le libellé `MOVEMENT_TYPE`.
- **`getStockStats.netChange`** : sans soustraire les dons, le « net 30 jours » serait surestimé. Ajouter `totalDonations` et l'inclure dans `netChange`.
- **Stock négatif** : refuser tout don dont la quantité (cumulée) dépasse le stock — ne jamais clamper silencieusement.
- **Session de caisse** : ne **pas** exiger de session ouverte (différence clé avec un règlement espèces de la story 1.2). Un don ne touche pas le tiroir.
- **Accès** : la **création** est ouverte à tous les rôles (bouton dans Ventes, non gardé) ; la **liste/reporting** des dons suit la visibilité de l'historique de stock (**manager/admin**). `StockPage` est déjà inaccessible au caissier ([`StockPage.tsx:43`](../../src/pages/StockPage.tsx#L43), [`Sidebar.tsx:80`](../../src/components/layout/Sidebar.tsx#L80)) → d'où le point d'entrée dans `SalesPage` pour le caissier.

### Hors périmètre (extensions possibles)

- Bénéficiaire du don (à qui l'on donne) ; pièce justificative / reçu imprimable du don ; annulation/retour d'un don (restitution de stock) ; prix de revient réel (coût) au lieu du prix catalogue ; outil assistant dédié `get_donations` (résumé « dons du mois ») ; quota/plafond de dons ; validation manager. Le présent périmètre couvre la saisie multi-produits, la traçabilité stock, la valeur estimée et la liste/reporting.

### Project Structure Notes

- **Backend** : [`convex/schema.ts`](../../convex/schema.ts), [`convex/references.ts`](../../convex/references.ts), **`convex/donations.ts`** (nouveau), [`convex/stock.ts`](../../convex/stock.ts).
- **UI** : `src/components/donations/` (nouveau : `DonationForm.tsx`, `DonationsList.tsx`, `index.ts`), [`src/pages/SalesPage.tsx`](../../src/pages/SalesPage.tsx) (point d'entrée tous rôles), [`src/pages/StockPage.tsx`](../../src/pages/StockPage.tsx) (onglet Dons), [`src/components/stock/StockHistory.tsx`](../../src/components/stock/StockHistory.tsx).
- **Exports/assistant** : [`convex/assistant.ts`](../../convex/assistant.ts), [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts), (optionnel) [`src/components/reports/ExportReportsModal.tsx`](../../src/components/reports/ExportReportsModal.tsx).
- **Aucune** modification du type `Page` ni de la `Sidebar` (l'onglet Dons vit dans `StockPage`).

### Tests (build + plan manuel — pas de framework de test)

1. `npx convex codegen` OK ; `npm run build` + `npx eslint` (fichiers modifiés) → **0 erreur**.
2. **Don multi-produits** : panier de 2 produits, donneur + motif, valider → un `DON-…`, 2 `stockMovements type:"donation"`, stock des 2 produits décrémenté, `totalValue` = Σ prix catalogue. Apparaît dans l'historique (badge « Don ») et dans la liste des Dons avec le bon total.
3. **Caissier** : un caissier (sans session de caisse) peut ouvrir « Faire un don » depuis Ventes et enregistrer un don. Le caissier **ne voit pas** la liste des dons (réservée manager/admin).
4. **Stock insuffisant** : quantité > stock (ou même produit en double dépassant le stock cumulé) → refus avec message ; aucun stock négatif.
5. **Donneur manquant** : validation bloquée, message clair. Motif vide → accepté.
6. **Neutralité caisse/CA** : après un don, `getTodayStats` (CA, ventes), la réconciliation de caisse et les créances sont **inchangés** ; aucune ligne `sales` créée.
7. **Stats stock** : `getStockStats.last30Days` expose `totalDonations` et `netChange = in − out − donations`.
8. **Non-régression** : ventes (espèces/Mobile/crédit), ajustements, entrées de stock, réconciliation et stories 1.1/1.2 inchangés ; export « Tous mouvements » affiche « Don ».

### References

- [Source: convex/sales.ts#L290-L502] `createSale` — motif décrément stock + insertion `stockMovements` + génération de références (à transposer pour N lignes).
- [Source: convex/stock.ts#L13-L74] `getStockHistory` (garde-fou rôle, validateur `args.type`) ; [#L79-L165] `getStockStats` (`totalIn`/`totalOut`/`netChange`).
- [Source: convex/clients.ts] `recordClientPayment` / `getReceivables` — motif de mutation + query récap `{ items, total, count }`.
- [Source: convex/references.ts#L8-L55] `ReferenceType`, `PREFIXES`, `DATED_TYPES`, `formatReference` (type daté → `DON-YYYYMMDD-XXXXX`).
- [Source: convex/audit.ts#L55-L81] `writeAuditLog` (catégorie `"stock"`).
- [Source: src/pages/SalesPage.tsx#L62-L150] `SalesContent` (onglets Ventes/Dépenses) — point d'insertion du bouton « Faire un don ».
- [Source: src/components/stock/StockHistory.tsx#L17-L90] `MovementType`, `getMovementBadge`, `getMovementIcon`, filtres (exhaustivité à étendre).
- [Source: src/pages/StockPage.tsx#L50-L82] `Tabs` (ajout onglet « Dons ») ; [#L43] garde manager/admin.
- [Source: convex/assistant.ts#L362-L385] outil `get_stock_movements` ; [#L617] description des filtres ; [#L644-L650] comptage `stock_movements`.
- [Source: src/lib/assistantExports.ts#L69-L73] `MOVEMENT_TYPE` ; [#L118-L141] export des mouvements.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story (implémentation séquentielle backend→UI) + revue adversariale multi-agents (workflow Convex/React, 5 dimensions, findings vérifiés).

### Debug Log References

- `npx convex codegen` → types régénérés (nouvelle table `donations`, type mouvement `donation`, champs `donationId`/`donationReference`, compteur `donation`). Backend TypeScript OK.
- `npm run build` (`tsc -b && vite build`) → **0 erreur** (seul avertissement : taille de chunk, préexistant).
- `npx eslint` sur les 16 fichiers touchés → **0 erreur**. Au passage : remplacement d'un `session._id as any` préexistant par `as Id<'cashSessions'>` dans `SalesPage.tsx` (lint propre).
- **Revue adversariale** (workflow, 21 agents) : 16 findings, 7 confirmés après vérification sceptique indépendante, 9 rejetés (vérifications positives / nitpicks). Les 7 confirmés ont été corrigés (voir Completion Notes).

### Completion Notes List

- **AC1-AC4 (saisie du don)** : `recordDonation({ donorName, motif?, items[] })` — tous rôles actifs, **agrégation par produit** (même produit sur 2 lignes → cumulé), validation stock par produit (pas de stock négatif), entiers > 0, donneur requis, motif optionnel (`undefined` si vide). En-tête `donations` (items dénormalisés + `previousStock`/`newStock` + totaux) + N `stockMovements` `type:"donation"` (un par produit, reliés `donationId`/`donationReference`), décrément de stock, audit `stock.donated` — **tout dans une mutation transactionnelle**. Valeur estimée `unitValue = product.price`, `lineValue`, `totalValue`/`totalQuantity`/`itemCount`.
- **AC5 (neutralité caisse/CA)** : un don **n'écrit aucune ligne `sales`** → confirmé par la revue (dimension régression-caisse-ca) qu'aucun calcul basé sur `sales` (`getTodayStats`, `getSalesEvolution`, réconciliation `calculateExpectedAmount`/`closeSession`, `getReceivables`, `analytics.ts`) ne capte les dons. Réconciliation strictement inchangée.
- **AC6 (historique stock)** : badge/icône/filtre « Don » dans `StockHistory` ; `getStockStats` expose `totalDonations` et `netChange = totalIn − totalOut − totalDonations`.
- **AC7 (suivi des dons)** : `getDonations` (manager/admin, caissier → structure vide) → carte « Total des dons » (valeur + nb + unités, total sur la période) + liste des en-têtes (donneur, motif, articles, valeur) dans l'onglet **Dons** de la page Stock. Export « Tous mouvements » inclut les dons (libellé « Don », net corrigé).
- **AC8 (sécurité & non-régression)** : référence `DON-…` ; aucune migration (table/champs nouveaux ou optionnels) ; exhaustivité de l'union `stockMovements.type` traitée partout (assistant `get_stock_movements` enum+casts+desc, `assistantExports`, `exportUtils`, `StockHistory`) ; build + lint OK.
- **Point d'entrée — décision d'implémentation (déviation Task 5)** : le bouton « Faire un don » a été placé dans la **barre supérieure globale** (`DashboardLayout`, tous rôles) plutôt que dans `SalesContent`. Raison : `SalesContent` est rendu **à l'intérieur** de `CashSessionProvider` (caisse) ; un caissier sans session ouverte, ou après clôture, n'aurait pas pu l'atteindre — ce qui contredisait AC1/AC3 (révélé par la revue, sévérité high). Placé dans le chrome global, le don est accessible : manager/admin **sans session** partout ; caissier sur toutes les pages dès sa session ouverte **et** sur l'écran de caisse clôturée (le header persiste au-dessus du contenu). La seule limite résiduelle — un caissier **avant** d'avoir ouvert sa caisse — relève du **modèle de caisse pré-existant de l'app** (le caissier est globalement contraint d'ouvrir une session pour opérer, via un modal bloquant non géré par cette story). Le **backend `recordDonation` n'exige aucune session** (garantie réelle). Le formulaire reste aussi disponible dans l'onglet Dons (manager/admin).
- **Corrections issues de la revue adversariale (7 findings confirmés)** :
  - [high] Point d'entrée caissier inatteignable derrière le gating de caisse → **déplacé dans `DashboardLayout` (header global)**, bouton in-page retiré de `SalesPage`.
  - [medium] `StockOverview` (Mouvements 30 j) affichait Entrées/Sorties/Net sans les dons (Net paraissait faux) → **ajout d'une tuile « Dons »** (grille `grid-cols-2 sm:grid-cols-4`).
  - [low] `ExportReportsModal` : description « Tous mouvements » → « Entrées, sorties, ajustements **et dons** ».
  - [low] `DonationForm` : `parseInt` tronquait les décimaux (« 5.9 » → 5) → bascule sur `Number(...)` + `step={1}` (rejet propre des non-entiers).
  - [low] `DonationForm` : sur-stock **cumulé** (même produit sur 2 lignes) désactivait le bouton sans message → **bannière** listant les produits en sur-stock.
  - [low] `DonationsList` : pagination figée à 100 et incohérence en-tête/liste → `limit` piloté par l'état (la requête recharge), bouton « Afficher plus » basé sur `data.count`.
- **Findings rejetés (9)** : vérifications positives (don n'impacte ni caisse ni CA ni `client.balance`) et nitpicks non bloquants (re-`get` produit pour `lowStock` = micro-inefficacité ; `now`/références au passage de minuit = parité avec `createSale` ; `getDonations` ne filtre pas `isActive` = convention projet transverse ; `key={index}` sur champs contrôlés = sans symptôme runtime).
- ⚠️ **Vérification manuelle en conditions réelles non effectuée** (pas d'exécution live ici). Validation = codegen/build/types/lint + revue logique multi-agents. Dérouler le plan de test (Dev Notes › Tests) avec `npx convex dev` actif avant prod.

### File List

- `convex/schema.ts` — table `donations` ; `stockMovements` : type `donation` + `donationId`/`donationReference` + index `by_donation` ; `counters.donation`.
- `convex/references.ts` — type `donation` → `DON-YYYYMMDD-XXXXX` (daté).
- `convex/donations.ts` — **nouveau** : `recordDonation`, `getDonations`.
- `convex/stock.ts` — `getStockStats` (`totalDonations`, `netChange`) ; `getStockHistory` (filtre type `donation`).
- `convex/assistant.ts` — outil `get_stock_movements` : enum + casts + description du filtre étendus à `donation`.
- `src/components/donations/DonationForm.tsx` — **nouveau** : formulaire panier (lignes produit, donneur, motif, valeur estimée, validations agrégées).
- `src/components/donations/DonationsList.tsx` — **nouveau** : récap « Total des dons » + liste des dons.
- `src/components/donations/index.ts` — **nouveau** : barrel export.
- `src/components/layout/DashboardLayout.tsx` — bouton global « Faire un don » (header, tous rôles) + Dialog `DonationForm`.
- `src/pages/StockPage.tsx` — onglet « Dons » (manager/admin) : `DonationForm` + `DonationsList`.
- `src/pages/SalesPage.tsx` — (lint) `session._id as Id<'cashSessions'>` ; pas de bouton don in-page (déplacé dans le header global).
- `src/components/stock/StockHistory.tsx` — type `donation` : badge/icône/filtre.
- `src/components/stock/StockOverview.tsx` — tuile « Dons » dans les stats 30 jours.
- `src/components/reports/ExportReportsModal.tsx` — libellé export « Tous mouvements ».
- `src/lib/assistantExports.ts` — `MOVEMENT_TYPE.donation = 'Don'` + cast.
- `src/lib/exportUtils.ts` — type union + `typeLabels.donation` + ligne résumé (Dons + net corrigé).
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-14 | 0.1 | Création de la story (cadrage : 5 décisions métier validées — don panier multi-produits, tous rôles, valeur estimée) | Claude Opus 4.8 |
| 2026-06-14 | 1.0 | Implémentation complète (9 tâches), codegen/build/lint OK ; revue adversariale multi-agents (7 findings corrigés, dont point d'entrée don déplacé dans le header global) ; statut → review | Claude Opus 4.8 |
