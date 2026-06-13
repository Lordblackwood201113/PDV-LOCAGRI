# Story 1.2 : Vente à crédit & suivi des créances (ardoise)

Status: review

<!-- Story issue d'une demande directe utilisateur. Décisions métier validées (voir Dev Notes). -->

## Story

En tant que **commerçant d'intrants agricoles**,
je veux **vendre à crédit à un client identifié et suivre ce que chaque client me doit, puis encaisser ses remboursements**,
afin de **gérer l'ardoise de campagne (l'agriculteur prend ses intrants et paie après récolte) sans fausser ma caisse.**

### Décisions métier validées (cadrage)

1. **Remboursement → caisse du caissier (jour J)** : un règlement encaissé compte comme une entrée d'espèces (ou Mobile Money) dans la session du caissier ce jour-là → la caisse tombe juste.
2. **Tout ou rien** : une vente est soit entièrement payée (espèces/Mobile Money), soit entièrement à crédit. Pas d'acompte à la vente.
3. **Crédit libre** : pas de plafond ; on affiche l'encours (total dû) du client.
4. **Caissier libre** : tout caissier peut vendre à crédit à un **client identifié** (obligatoire). Pas de validation manager.

### Le point comptable (cœur de la story)

- Une **vente à crédit** n'encaisse rien → elle **ne doit pas** entrer dans l'attendu de caisse (ni espèces, ni Mobile Money). Comme `paymentMethod = "credit"` n'est ni `cash` ni `mobile_money`, elle est déjà exclue des filtres existants : il suffit de ne rien casser.
- Un **règlement en espèces** encaissé par un caissier entre dans **sa** session ce jour-là → l'attendu doit l'inclure : `expectedAmount += totalCashRepayments`. (Mêmes deux fonctions que la story 1.1.)
- Un **règlement Mobile Money** est tracé mais n'entre pas dans le tiroir.

## Acceptance Criteria

1. **Mode de paiement « Crédit »** — Un 3ᵉ mode « Crédit » est disponible à la vente. Quand il est choisi : le bloc « Montant reçu » est masqué, **un client est obligatoire** (validation bloquée sinon, message clair), et l'**encours actuel** du client sélectionné est affiché s'il est > 0.
2. **Vente à crédit = tout ou rien** — La vente enregistre `paymentMethod = "credit"`, `paymentStatus = "unpaid"`, `amountDue = total`, et **incrémente** l'encours du client (`clients.balance += total`) de façon atomique. Le stock est décrémenté comme pour toute vente.
3. **Exclusion de la caisse** — Une vente à crédit n'apparaît ni dans `totalCashSales` ni dans `totalMobileSales` et n'affecte pas `expectedAmount`. (Vérifier la non-régression des filtres.)
4. **Encaisser un règlement** — `recordClientPayment({ clientId, amount, method, note? })` : valide `0 < amount ≤ encours` (pas de sur-remboursement), génère une référence `REG-YYYYMMDD-XXXXX`, **décrémente** l'encours du client, **alloue le paiement en FIFO** aux ventes à crédit impayées (les plus anciennes d'abord : décrémente leur `amountDue`, passe `paymentStatus="paid"` à 0), et enregistre une ligne `clientPayments` (avec `balanceAfter`).
5. **Règlement espèces dans la caisse** — Un règlement en **espèces** exige une **session de caisse ouverte** pour le caissier (sinon erreur explicite) et est rattaché à cette session (`sessionId`). La réconciliation (`calculateExpectedAmount` **ET** `closeSession`) ajoute `totalCashRepayments` (somme des règlements espèces de la session) à l'attendu, le **persiste** sur la session, et le récap de clôture affiche une ligne **« Règlements clients (espèces) »**. Un règlement **Mobile Money** ne nécessite pas de session et n'entre pas dans l'attendu espèces.
6. **Suivi des créances** — Une vue liste les clients **débiteurs** (encours > 0) avec leur encours, et le **total des créances**. Pour un client donné, on peut consulter son **ardoise** (ventes à crédit + règlements) et déclencher « Encaisser un règlement ».
7. **Affichages** — La fiche client montre un **badge d'encours** quand > 0. Les **ventes récentes** distinguent visuellement une vente « Crédit » (impayée). Les stats du jour exposent un total **crédit** distinct des espèces/Mobile Money.
8. **Sécurité & non-régression** — Vente à crédit impossible sans client identifié. Pas de sur-remboursement. `getTodayStats`/réconciliation des ventes espèces/Mobile Money inchangées pour les ventes existantes. Build TypeScript + lint OK ; aucune migration (champs optionnels).

## Tasks / Subtasks

- [x] **Task 1 — Schémas** (AC: 2, 4, 5) — [`convex/schema.ts`](../../convex/schema.ts)
  - [x] `clients` : ajouter `balance: v.optional(v.number())` (encours, défaut traité comme 0).
  - [x] `sales` : étendre `paymentMethod` avec `v.literal("credit")` ; ajouter `paymentStatus: v.optional(v.union(v.literal("paid"), v.literal("unpaid")))` et `amountDue: v.optional(v.number())`.
  - [x] `cashSessions` : ajouter `totalCashRepayments: v.optional(v.number())`.
  - [x] `counters.type` : ajouter `v.literal("payment")`.
  - [x] Nouvelle table `clientPayments` : `reference` (string), `clientId` (id clients), `clientReference` (string), `clientName` (string), `amount` (number), `method` (union cash|mobile_money), `date` (number), `userId` (string), `userName` (string), `sessionId` (optional id cashSessions), `note` (optional string), `balanceAfter` (number). Index `by_client` (["clientId"]), `by_date` (["date"]), `by_session` (["sessionId"]).

- [x] **Task 2 — Référence de règlement** (AC: 4) — [`convex/references.ts`](../../convex/references.ts)
  - [x] Ajouter `"payment"` au type `ReferenceType`, à `PREFIXES` (`payment: "REG"`), et au validateur `args.type` de `getNextReference`. Traiter `payment` comme **daté** (comme sale/movement) → `REG-YYYYMMDD-XXXXX` (étendre la condition `needsDate` et `formatReference`).

- [x] **Task 3 — Vente à crédit dans `createSale`** (AC: 1, 2, 3, 7) — [`convex/sales.ts`](../../convex/sales.ts)
  - [x] `args.paymentMethod` : ajouter `v.literal("credit")`.
  - [x] Si `paymentMethod === "credit"` : exiger `args.clientId` (sinon `throw "Une vente à crédit nécessite un client identifié"`) ; définir `paymentStatus = "unpaid"`, `amountDue = total` ; après l'insert de la vente, **patcher** le client : `balance = (client.balance ?? 0) + total`. (Le client est déjà récupéré plus haut dans le handler.)
  - [x] Pour les ventes payées (`cash`/`mobile_money`) : `paymentStatus = "paid"`, `amountDue = 0` (ou `undefined`). Ne pas exécuter la logique « montant reçu » pour le crédit.
  - [x] Persister `paymentStatus`/`amountDue` dans l'insert `sales`.
  - [x] `getTodayStats` : ajouter `creditAmount`/`creditCount` (ventes `paymentMethod === "credit"`). Ne **pas** les inclure dans `cashAmount`/`mobileAmount`.

- [x] **Task 4 — Créances : mutation + queries** (AC: 4, 6) — [`convex/clients.ts`](../../convex/clients.ts)
  - [x] `recordClientPayment({ clientId, amount, method, note? })` : auth + user actif ; client existant et actif ; `Number.isFinite(amount)`, `amount > 0`, `amount <= (client.balance ?? 0)` (sinon erreurs explicites) ; si `method === "cash"`, récupérer la session ouverte du jour du caissier (`by_user_date`, status `open`) → si absente `throw "Ouvrez votre caisse pour encaisser un règlement en espèces"` et lier `sessionId` ; générer `REG-…` ; `balanceAfter = balance - amount` ; patcher `clients.balance = balanceAfter` ; **FIFO** : charger les ventes à crédit `paymentStatus === "unpaid"` du client (via index `by_client`, triées par `date` asc), décrémenter `amountDue` (passer `paymentStatus="paid"` à 0) jusqu'à épuisement du montant ; insérer `clientPayments`. Retourner `{ reference, balanceAfter }`.
  - [x] `getReceivables()` : clients avec `(balance ?? 0) > 0`, triés par encours desc, avec `displayName` ; renvoyer aussi `totalOutstanding` et `debtorCount` (ex. via un objet `{ clients, totalOutstanding, debtorCount }`). Accessible à tout utilisateur authentifié.
  - [x] `getClientLedger({ clientId })` : `{ client (+displayName, balance), creditSales: ventes paymentMethod credit triées desc (date, reference, total, amountDue, paymentStatus), payments: clientPayments triés desc }`.

- [x] **Task 5 — Réconciliation des règlements espèces** (AC: 5) — [`convex/cashSessions.ts`](../../convex/cashSessions.ts)
  - [x] Dans `calculateExpectedAmount` **et** `closeSession` : charger `clientPayments` `by_session` = `session._id`, `totalCashRepayments = Σ amount où method === "cash"`. Nouvelle formule : `expectedAmount = openingAmount + totalCashSales + totalMobileChangeGiven + totalCashRepayments − totalExpenses`. Ajouter `totalCashRepayments` au retour ; le persister dans le `patch` de `closeSession` (et l'ajouter au retour de `closeSession`).

- [x] **Task 6 — UI vente à crédit** (AC: 1, 2, 7) — [`src/components/dashboard/QuickSalePanel.tsx`](../../src/components/dashboard/QuickSalePanel.tsx)
  - [x] `PaymentMethod` = `'cash' | 'mobile_money' | 'credit'`. Ajouter un 3ᵉ bouton « Crédit » (icône `Notebook`), passer la grille des modes en `grid-cols-3`.
  - [x] Quand `paymentMethod === 'credit'` : le bloc « Montant reçu » reste masqué (condition `=== 'cash'`). Charger le client sélectionné (`useQuery(api.clients.getClient, selectedClientId ? { clientId } : 'skip')`) et afficher son encours si `> 0` (« Ce client doit déjà X FCFA »). Afficher un avertissement si aucun client : « Sélectionnez un client pour la vente à crédit ».
  - [x] `canSell` : si `paymentMethod === 'credit'`, exiger `selectedClientId !== null` (et stock OK). Les conditions espèces (montant reçu) ne s'appliquent qu'au paiement espèces.
  - [x] `handleSale` : transmettre `paymentMethod`; pour le crédit, `amountReceived`/`changeMethod` restent `undefined`. Toast adapté : « Vente à crédit — {client} doit maintenant {nouvel encours} ».

- [x] **Task 7 — UI suivi des créances** (AC: 6, 7) — [`src/pages/ClientsPage.tsx`](../../src/pages/ClientsPage.tsx) (+ nouveau composant règlement)
  - [x] Carte récap en haut : **Total des créances** + nombre de clients débiteurs (via `getReceivables`).
  - [x] `ClientRow` : afficher un badge rouge « Doit {balance} FCFA » si `balance > 0`, et un bouton **« Règlement »** (visible pour tous, pas seulement `canEdit`) ouvrant un dialog.
  - [x] `RecordPaymentDialog` : affiche l'encours, champ montant (prérempli = encours, max = encours), choix méthode (Espèces/Mobile Money), note optionnelle, et une **ardoise compacte** (dernières ventes à crédit + règlements via `getClientLedger`). Soumission → `recordClientPayment` ; toast ; reset.

- [x] **Task 8 — Affichages crédit & règlements** (AC: 5, 7) — [`RecentSales.tsx`](../../src/components/dashboard/RecentSales.tsx), [`CloseSessionModal.tsx`](../../src/components/cash/CloseSessionModal.tsx)
  - [x] `RecentSales` : gérer 3 cas de `paymentMethod` (l'`else` actuel suppose Mobile). Pour `credit` : icône `Notebook` + pastille distincte + libellé « À crédit ».
  - [x] `CloseSessionModal` : ajouter une ligne **« Règlements clients (espèces) »** (+`totalCashRepayments`, gardée en caisse) si > 0, après la ligne monnaie Mobile Money. Vérifier que `Ouverture + Ventes espèces + Monnaie MoMo + Règlements − Dépenses = Attendu`.

- [x] **Task 9 — Vérification** (AC: 8)
  - [x] `npx convex codegen` ; `npm run build` (tsc + vite) ; `npx eslint` sur les fichiers modifiés → 0 erreur.
  - [x] Dérouler le plan de test manuel (Dev Notes › Tests).

## Dev Notes

### Modèle de données — choix structurants

- **Encours dénormalisé** : `clients.balance` est la source de vérité de « combien doit ce client », mise à jour atomiquement à chaque vente à crédit (`+total`) et règlement (`−amount`). Suit le motif existant de `safe.currentBalance`. Repli `(balance ?? 0)` pour les clients existants.
- **Allocation FIFO** : un règlement réduit l'encours **et** solde les ventes impayées les plus anciennes (`amountDue`/`paymentStatus`). « Tout ou rien » concerne la **création** de la vente (pas d'acompte), pas le remboursement — un règlement **peut être partiel** vis-à-vis de l'encours global.
- **`clientPayments`** = journal des règlements (audit, ardoise, réconciliation). `sessionId` rattache un règlement espèces à la session du caissier (motif identique à `expenses.withdrawnFromSessionId`).

### Réconciliation — invariant

`expectedAmount = ouverture + ventes espèces + monnaie rendue par Mobile Money + règlements clients espèces − dépenses`.
La vente à crédit n'apparaît dans aucun de ces termes (paymentMethod `credit`). Repli `?? 0` partout → ventes/sessions existantes strictement neutres. **Les deux fonctions** (`calculateExpectedAmount`, `closeSession`) doivent rester en miroir (cf. story 1.1).

### Pièges à éviter

- **Ne pas** compter une vente à crédit comme revenu encaissé : `cashAmount`/`mobileAmount` excluent le crédit ; `creditAmount` est un total séparé.
- **Atomicité** : l'incrément `clients.balance` à la vente à crédit et le couple (décrément balance + allocation FIFO + insert règlement) doivent se faire dans la même mutation transactionnelle Convex.
- **Sur-remboursement** interdit (`amount ≤ balance`) → sinon encours négatif.
- **Règlement espèces sans caisse ouverte** : refuser, sinon l'argent n'est rattaché à aucune session et la caisse ne tombe pas juste.
- **Exhaustivité TypeScript** : ajouter `credit` à l'union `paymentMethod` peut révéler des `switch`/ternaires supposant 2 valeurs (ex. `RecentSales` `else = mobile`). Le build les signalera — tous les traiter.

### Hors périmètre (stories séparées)

- Acompte / paiement partiel à la vente ; plafond de crédit ; validation manager ; relances WhatsApp/SMS automatiques ; reçu imprimable du règlement ; intérêts/pénalités de retard ; échéance (`dueDate`) et liste des retards (peut être ajouté ensuite — non requis ici).

### Project Structure Notes

- Backend : `convex/schema.ts`, `convex/references.ts`, `convex/sales.ts`, `convex/clients.ts`, `convex/cashSessions.ts`.
- UI : `src/components/dashboard/QuickSalePanel.tsx`, `src/pages/ClientsPage.tsx` (+ dialog règlement), `src/components/dashboard/RecentSales.tsx`, `src/components/cash/CloseSessionModal.tsx`.
- Accès : la page Clients est visible par tous les rôles ([`Sidebar.tsx:85`](../../src/components/layout/Sidebar.tsx#L85)) → le caissier peut encaisser un règlement. Le bouton « Règlement » n'est PAS gaté par `canEdit`.

### Tests (build + plan manuel — pas de framework de test)

1. `npm run build` + `npx eslint` (fichiers modifiés) → 0 erreur. `npx convex codegen` OK.
2. **Vente à crédit** : sélectionner un client, mode Crédit, valider → vente `unpaid`, encours client = total ; sans client → validation bloquée. La vente n'entre pas dans l'attendu de caisse.
3. **Règlement espèces (caisse ouverte)** : encaisser un montant ≤ encours → encours réduit, vente(s) soldée(s) FIFO, attendu de caisse +montant, ligne « Règlements clients (espèces) » au récap, écart = 0 à la clôture.
4. **Règlement espèces sans caisse ouverte** : refusé avec message.
5. **Règlement Mobile Money** : encours réduit, n'entre pas dans l'attendu espèces.
6. **Sur-remboursement** : montant > encours → refusé.
7. **Créances** : la vue liste le client débiteur, total correct ; après solde complet, l'encours tombe à 0 et le client sort de la liste.
8. **Non-régression** : ventes espèces/Mobile Money et story 1.1 (monnaie MoMo) inchangées.

### References

- [Source: convex/cashSessions.ts#L108] et [#L366] points de calcul de l'attendu (story 1.1 y a déjà ajouté `totalMobileChangeGiven`).
- [Source: convex/sales.ts#L287] `createSale` (client déjà chargé L347-357).
- [Source: convex/clients.ts#L147] motif de mutation + `formatClientName` (L336).
- [Source: convex/references.ts#L8-L50] `ReferenceType`, `PREFIXES`, `formatReference`.
- [Source: src/components/layout/Sidebar.tsx#L85] accès Clients tous rôles.
- [Source: src/components/dashboard/RecentSales.tsx#L80-L88] icône de paiement à étendre.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story.

### Debug Log References

- `npx convex codegen` → types régénérés (nouvelle table `clientPayments`, champs sales/clients/cashSessions, type compteur `payment`).
- `npm run build` (`tsc -b && vite build`) → **0 erreur** (seul avertissement : taille de chunk, préexistant).
- Exhaustivité TypeScript révélée par l'ajout de `credit` à l'union (corrigée) : (1) état `changeMethod` de `QuickSalePanel` re-typé `'cash' | 'mobile_money'` ; (2) `SaleExportData.paymentMethod` + libellé d'export ([`src/lib/exportUtils.ts`](../../src/lib/exportUtils.ts)) étendus à `credit`.
- Ternaires runtime « 2 modes » corrigés (non vus par le build) : `RecentSales` et `ReportsPage` (icône + libellé crédit).
- `npx eslint` sur les 11 fichiers modifiés → **0 erreur** (au passage : `let counter` → `const` dans `references.ts:migrateProductReferences`, lint préexistant).

### Completion Notes List

- **AC1-2** : 3ᵉ mode « Crédit » (icône violette). Client obligatoire (`canSell`), encours affiché, `montant reçu` masqué. Vente crédit → `paymentStatus="unpaid"`, `amountDue=total`, `clients.balance += total` (atomique).
- **AC3** : crédit exclu de l'attendu (paymentMethod ni `cash` ni `mobile_money`). Filtres existants intacts.
- **AC4** : `recordClientPayment` — validation `0 < amount ≤ encours`, référence `REG-`, décrément de l'encours, **allocation FIFO** aux ventes impayées (`amountDue`/`paymentStatus`), insert `clientPayments` (+`balanceAfter`).
- **AC5** : règlement espèces → caisse ouverte obligatoire, rattaché à la session ; `expectedAmount += totalCashRepayments` dans **les deux** fonctions, persisté sur la session, **ligne « Règlements clients (espèces) »** au récap de clôture. Règlement Mobile Money tracé hors tiroir.
- **AC6** : `getReceivables` (clients débiteurs + total + nombre), `getClientLedger` (ventes crédit + règlements). UI : carte « Total des créances », badge « Doit X » par client, bouton « Règlement » (non gaté `canEdit`), dialog avec ardoise compacte.
- **AC7** : badge encours, distinction visuelle crédit dans `RecentSales`/`ReportsPage` (icône Notebook violette + « à crédit »), `getTodayStats` expose `creditAmount`/`creditCount`.
- **AC8** : vente crédit sans client refusée ; sur-remboursement refusé ; flux espèces/mobile/story 1.1 inchangés ; build + lint OK ; aucune migration (champs optionnels, repli `?? 0`).
- **Cohérence encours** : `clients.balance` (source de vérité) et la somme des `amountDue` des ventes impayées restent synchronisés (incrément/décrément en miroir, tout dans des mutations transactionnelles).
- ⚠️ **Vérification manuelle en conditions réelles non effectuée** (pas d'exécution live ici). Validation = build/types/lint + revue logique. Dérouler le plan de test (8 scénarios) avec `npx convex dev` actif avant prod.

### File List

- `convex/schema.ts` — `clients.balance` ; `sales` : `credit`/`paymentStatus`/`amountDue` ; `cashSessions.totalCashRepayments` ; `counters.payment` ; **table `clientPayments`**.
- `convex/references.ts` — type `payment` → `REG-` daté (`DATED_TYPES`).
- `convex/sales.ts` — `createSale` chemin crédit + encours client ; `getTodayStats` crédit.
- `convex/clients.ts` — `recordClientPayment`, `getReceivables`, `getClientLedger`.
- `convex/cashSessions.ts` — `totalCashRepayments` dans `calculateExpectedAmount` + `closeSession` (formule, persistance, retours).
- `src/components/dashboard/QuickSalePanel.tsx` — mode Crédit, client requis, encours, toast.
- `src/pages/ClientsPage.tsx` — récap créances, badge encours, bouton Règlement, `RecordPaymentDialog` (+ardoise).
- `src/components/dashboard/RecentSales.tsx` — affichage crédit.
- `src/components/cash/CloseSessionModal.tsx` — ligne « Règlements clients (espèces) ».
- `src/pages/ReportsPage.tsx` — affichage crédit (historique des ventes).
- `src/lib/exportUtils.ts` — `paymentMethod` + libellé export `Crédit`.
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-13 | 0.1 | Création de la story (cadrage : 4 décisions métier validées) | Claude Opus 4.8 |
| 2026-06-13 | 1.0 | Implémentation complète (9 tâches), build/lint/codegen OK, statut → review | Claude Opus 4.8 |
