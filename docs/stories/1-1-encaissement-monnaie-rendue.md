# Story 1.1 : Encaissement — montant reçu, monnaie à rendre et moyen de rendu

Status: review

<!-- Story créée à partir d'une demande directe utilisateur (pas d'epics.md dans ce projet).
     Contexte : feuille de route d'analyse des manques — "quick win" du domaine Ventes/Encaissement.
     Validation optionnelle : lancer validate-create-story avant dev-story. -->

## Story

En tant que **caissier·ère**,
je veux **saisir l'argent que le client me remet, voir la monnaie à rendre calculée automatiquement, et indiquer si je rends cette monnaie en espèces ou en Mobile Money**,
afin que **la monnaie rendue soit juste, tracée, et que ma caisse tombe juste à la clôture même quand je rends la monnaie par Mobile Money (faute de petite monnaie en espèces).**

### Contexte métier (le « pourquoi » exact)

Cas réel chez LOCAGRI : un client paie **en espèces**, mais le caissier **n'a pas de petite monnaie** → il rend la différence **par Mobile Money**.
Conséquence comptable : l'argent **physiquement présent dans le tiroir** pour cette vente n'est PAS le montant de la vente, mais le **montant reçu** (le gros billet est conservé, la monnaie part par Mobile Money).

Exemple : vente = 7 000 FCFA · le client donne 10 000 FCFA · monnaie = 3 000 FCFA rendue par Mobile Money.
- Espèces conservées dans le tiroir pour cette vente : **10 000** (= 7 000 de vente + 3 000 de monnaie gardée parce qu'elle est partie par Mobile Money).
- Sortie Mobile Money : **3 000**.

⚠️ **Aujourd'hui la clôture compte seulement `sale.total` (7 000) comme espèces** ([`convex/cashSessions.ts:382`](../../convex/cashSessions.ts#L382) et [`:108`](../../convex/cashSessions.ts#L108)). Le tiroir contiendra 10 000 → **écart fantôme de +3 000 systématique**. Cette story corrige ce calcul **et** rend la monnaie Mobile Money visible dans le récap de caisse.

## Acceptance Criteria

1. **Saisie du montant reçu (paiement espèces uniquement)** — Quand le mode de paiement sélectionné est **Espèces**, un champ « Montant reçu » s'affiche, avec saisie libre **et** des raccourcis (chips) : « Compte juste » (= total), 500, 1 000, 2 000, 5 000, 10 000 FCFA. Quand le mode est **Mobile Money**, le champ « Montant reçu » **n'apparaît pas** (le flux Mobile Money reste strictement identique à l'existant).
2. **Calcul de la monnaie à rendre** — La « Monnaie à rendre » = `montantReçu − total`, affichée en grand. Si `montantReçu < total`, afficher « Montant insuffisant » et **désactiver** le bouton Valider. Si `montantReçu = total`, la monnaie vaut 0.
3. **Choix du moyen de rendu** — Si la monnaie à rendre est **> 0**, le caissier choisit comment il la rend : **Espèces** (défaut) ou **Mobile Money**. Si la monnaie = 0, ce choix est masqué.
4. **Enregistrement et traçabilité** — `createSale` enregistre sur la vente : `amountReceived`, `changeDue`, `changeMethod`, `mobileMoneyChange`. Validations serveur : pour un paiement espèces avec montant reçu fourni, `amountReceived ≥ total` ; si `changeDue > 0`, `changeMethod` est requis. Pour un paiement Mobile Money, aucun montant reçu n'est requis ni stocké.
5. **Réconciliation de caisse correcte (cœur de la story)** — Le montant **attendu** de caisse (dans `calculateExpectedAmount` **ET** `closeSession`) intègre la monnaie rendue par Mobile Money comme **espèces conservées dans le tiroir** :
   `expectedAmount = openingAmount + totalCashSales + totalMobileChangeGiven − totalExpenses`
   où `totalCashSales` reste inchangé (`Σ sale.total` des ventes espèces) et `totalMobileChangeGiven = Σ mobileMoneyChange`. Les ventes existantes sans `mobileMoneyChange` valent `0` (`?? 0`) → comportement strictement identique à l'actuel. **Aucun écart fantôme** quand la monnaie est rendue en Mobile Money.
6. **Affichage côté manager / clôture** — Le récapitulatif de caisse affiche une ligne **« Monnaie rendue par Mobile Money »** (= `totalMobileChangeGiven`, additionnée à l'attendu), visible dès qu'elle est > 0. Ce montant est aussi **persisté sur la session** à la clôture (consultable a posteriori), et le **net Mobile Money** disponible = `totalMobileSales − totalMobileChangeGiven`.
7. **Aucune régression** — Les statistiques de **revenus** (`getTodayStats` : `cashAmount`/`mobileAmount`) restent basées sur `sale.total` (la vente reste un revenu de 7 000, pas 10 000). Le build TypeScript (`npm run build`) et le déploiement Convex passent. Le flux Mobile Money et toutes les ventes existantes restent fonctionnels.

## Tasks / Subtasks

- [x] **Task 1 — Étendre les schémas `sales` et `cashSessions`** (AC: 4, 6) — [`convex/schema.ts`](../../convex/schema.ts)
  - [x] Table `sales` ([lignes 67-92](../../convex/schema.ts#L67-L92)) : ajouter ces champs **optionnels** (rétro-compat, aucune migration), après `total` :
    - `amountReceived: v.optional(v.number())` — espèces remises par le client (vente espèces).
    - `changeDue: v.optional(v.number())` — monnaie à rendre = `amountReceived − total` (≥ 0).
    - `changeMethod: v.optional(v.union(v.literal("cash"), v.literal("mobile_money")))` — moyen de rendu (présent seulement si `changeDue > 0`).
    - `mobileMoneyChange: v.optional(v.number())` — part de la monnaie rendue **via Mobile Money** (sortie MoMo ; `0` si rendue en espèces ou compte juste).
  - [x] Table `cashSessions` ([lignes 126-149](../../convex/schema.ts#L126-L149)) : ajouter `totalMobileChangeGiven: v.optional(v.number())` (persistance à la clôture pour consultation manager).
  - [x] Ne PAS ajouter d'index (aucune requête ne filtre sur ces champs). Ne PAS stocker de `cashCollected` (redondant : `= total + mobileMoneyChange`).

- [x] **Task 2 — Mettre à jour la mutation `createSale`** (AC: 1, 2, 3, 4) — [`convex/sales.ts:287-424`](../../convex/sales.ts#L287-L424)
  - [x] Ajouter aux `args` : `amountReceived: v.optional(v.number())` et `changeMethod: v.optional(v.union(v.literal("cash"), v.literal("mobile_money")))`.
  - [x] Après `const total = product.price * args.quantity` ([ligne 360](../../convex/sales.ts#L360)), dériver :
    - Si `args.paymentMethod === "cash"` ET `args.amountReceived !== undefined` :
      - Valider `args.amountReceived >= total`, sinon `throw new Error("Le montant reçu est inférieur au total")`.
      - `changeDue = args.amountReceived - total`.
      - Si `changeDue > 0` et `args.changeMethod === undefined` → `throw new Error("Précisez comment la monnaie est rendue (espèces ou Mobile Money)")`.
      - `changeMethod = changeDue > 0 ? args.changeMethod : undefined`.
      - `mobileMoneyChange = changeMethod === "mobile_money" ? changeDue : 0`.
    - Sinon (Mobile Money, ou espèces sans montant reçu — chemin legacy) : laisser les 4 champs `undefined`. **Ne pas** stocker `amountReceived`/`changeMethod` pour un paiement Mobile Money.
  - [x] Passer les champs dérivés dans `ctx.db.insert("sales", { ... })` ([ligne 372](../../convex/sales.ts#L372)).
  - [x] Ajouter au retour de la mutation : `changeDue` et `changeMethod` (pour le toast côté UI).

- [x] **Task 3 — Corriger la réconciliation de caisse** (AC: 5, 6, 7) — [`convex/cashSessions.ts`](../../convex/cashSessions.ts)
  - [x] Dans **`calculateExpectedAmount`** : après le calcul des `cashSales`/`mobileSales` (vers la [ligne 108](../../convex/cashSessions.ts#L108)), ajouter
    `const totalMobileChangeGiven = allSales.reduce((sum, s) => sum + (s.mobileMoneyChange ?? 0), 0);`
    Laisser `totalCashSales` **inchangé** (`Σ s.total`). Remplacer la formule ([ligne 126](../../convex/cashSessions.ts#L126)) par
    `const expectedAmount = session.openingAmount + totalCashSales + totalMobileChangeGiven - totalExpenses;`
    Ajouter `totalMobileChangeGiven` à l'objet retourné.
  - [x] Dans **`closeSession`** : appliquer **exactement** le même calcul (`totalMobileChangeGiven`, [ligne 366](../../convex/cashSessions.ts#L366) et formule [ligne 382](../../convex/cashSessions.ts#L382)). ⚠️ Les deux fonctions doivent rester cohérentes, sinon l'attendu affiché ≠ l'attendu enregistré.
  - [x] Dans le `ctx.db.patch(session._id, { ... })` de `closeSession` ([lignes 393-403](../../convex/cashSessions.ts#L393-L403)) : persister `totalMobileChangeGiven`.
  - [x] **Ne PAS toucher** à `getTodayStats` ([`convex/sales.ts:124-126`](../../convex/sales.ts#L124-L126)) : `cashAmount`/`mobileAmount` représentent le **revenu** par mode de paiement et doivent rester sur `s.total`.

- [x] **Task 4 — Interface d'encaissement** (AC: 1, 2, 3) — [`src/components/dashboard/QuickSalePanel.tsx`](../../src/components/dashboard/QuickSalePanel.tsx)
  - [x] Nouveaux états : `const [amountReceived, setAmountReceived] = useState<number | ''>('')` et `const [changeMethod, setChangeMethod] = useState<'cash' | 'mobile_money'>('cash')`.
  - [x] Dérivés : `const changeDue = paymentMethod === 'cash' && typeof amountReceived === 'number' ? amountReceived - total : 0` ; `const insufficient = paymentMethod === 'cash' && typeof amountReceived === 'number' && amountReceived < total`.
  - [x] Sous le bloc « Paiement » ([lignes 213-246](../../src/components/dashboard/QuickSalePanel.tsx#L213-L246)), n'afficher le bloc « Montant reçu » **que si `paymentMethod === 'cash'`** : input numérique + chips [« Compte juste » → `setAmountReceived(total)`, 500, 1000, 2000, 5000, 10000]. Les chips **fixent** la valeur (pas d'incrément).
  - [x] Afficher « Monnaie à rendre » en grand = `Math.max(0, changeDue)`. Si `insufficient`, afficher « Montant insuffisant » en rouge.
  - [x] Si `changeDue > 0`, afficher un sélecteur « Rendre la monnaie en : [Espèces] [Mobile Money] » lié à `changeMethod` (réutiliser le style des 2 boutons de paiement existants, [lignes 218-245](../../src/components/dashboard/QuickSalePanel.tsx#L218-L245)). Masquer si `changeDue <= 0`.
  - [x] `canSell` ([ligne 88](../../src/components/dashboard/QuickSalePanel.tsx#L88)) : pour `paymentMethod === 'cash'`, exiger `typeof amountReceived === 'number' && amountReceived >= total`. Pour Mobile Money, inchangé.
  - [x] Dans `handleSale` ([ligne 49](../../src/components/dashboard/QuickSalePanel.tsx#L49)), passer `amountReceived` et `changeMethod` à `createSale` **uniquement** pour un paiement espèces (sinon `undefined`).
  - [x] Enrichir le toast de succès avec la monnaie rendue et son moyen quand `changeDue > 0` (ex. « Monnaie : 3 000 FCFA · Mobile Money »).
  - [x] Réinitialiser `amountReceived` (`''`) et `changeMethod` (`'cash'`) après une vente réussie et lors d'un changement de produit ([ligne 113](../../src/components/dashboard/QuickSalePanel.tsx#L113)) / de mode de paiement.

- [x] **Task 5 — Afficher la monnaie Mobile Money dans le récap de caisse** (AC: 6) — [`src/components/cash/CloseSessionModal.tsx`](../../src/components/cash/CloseSessionModal.tsx)
  - [x] Dans le récap (entre la ligne « Ventes Mobile » [L154-162](../../src/components/cash/CloseSessionModal.tsx#L154-L162) et le bloc « Dépenses »), ajouter une ligne conditionnelle, affichée si `expectedData.totalMobileChangeGiven > 0` :
    libellé **« Monnaie rendue (Mobile Money) »**, valeur `+{formatPrice(expectedData.totalMobileChangeGiven)}`, avec un sous-texte « gardée en caisse ». Couleur cohérente avec les lignes additives (vert `#016124`).
  - [x] Vérifier visuellement que l'arithmétique du récap se lit juste : `Ouverture + Ventes espèces + Monnaie rendue (Mobile Money) − Dépenses = Montant attendu`.
  - [x] (Secondaire) Si `SessionStatus.tsx` / `SalesDashboard.tsx` / `DashboardPage.tsx` affichent un mini-récap d'attendu, ils consomment déjà `calculateExpectedAmount` : aucune correction de calcul nécessaire (la query renvoie le bon `expectedAmount`). Ajouter la ligne d'info y est optionnel.

- [x] **Task 6 — Vérification manuelle** (AC: 7) — *(pas de framework de test automatisé dans ce projet : voir Dev Notes › Tests)*
  - [x] `npm run build` (lance `tsc -b`) sans erreur ; `npx convex dev` déploie les 2 schémas sans erreur.
  - [x] Dérouler le plan de test manuel ci-dessous (5 scénarios) et confirmer l'absence d'écart fantôme + l'affichage de la monnaie Mobile Money.

## Dev Notes

### Architecture & contraintes (à respecter)

- **Stack** : React 19 + Vite, Convex `^1.31.6` (mutations/queries), Clerk pour l'auth, Tailwind v4, composants UI maison dans [`src/components/ui/`](../../src/components/ui/). Pas de routeur (navigation par état `Page`). Devise : FCFA, entiers (pas de centimes).
- **Un seul point d'entrée de vente** : `createSale` n'est appelé QUE par [`QuickSalePanel.tsx:49`](../../src/components/dashboard/QuickSalePanel.tsx#L49). Le composant est monté par `SalesDashboard.tsx` et `SalesPage.tsx` — **modifier `QuickSalePanel` suffit**, les deux pages en héritent. Ne pas créer de nouveau formulaire.
- **Convention dénormalisée** : ce codebase stocke des valeurs dérivées sur la ligne (ex. `productName`, `clientName`, `total`). On stocke donc `mobileMoneyChange` (qui pilote la réconciliation et l'affichage manager). On **ne stocke pas** `cashCollected` : redondant avec `total + mobileMoneyChange`, et la réconciliation n'en a pas besoin grâce à la décomposition ci-dessous.
- **Rétro-compatibilité** : tous les nouveaux champs sont `v.optional(...)`. Les ventes existantes n'ont pas `mobileMoneyChange` → `?? 0` → `totalMobileChangeGiven = 0` → la formule d'attendu redevient **exactement** l'actuelle. **Aucune migration de données.**
- **Atomicité** : `createSale` fait déjà vente + patch stock + mouvement de stock dans une seule mutation transactionnelle. Ajouter les champs dans l'`insert` existant ([ligne 372](../../convex/sales.ts#L372)) ; ne pas introduire d'`insert`/`patch` séparé.

### Le calcul, formalisé (à ne pas se tromper)

Pour une vente payée en **espèces**, on stocke :

| Cas | `amountReceived` | `changeDue` | `changeMethod` | `mobileMoneyChange` |
|-----|------------------|-------------|----------------|---------------------|
| Compte juste | `total` | `0` | `undefined` | `0` |
| Monnaie rendue en espèces | `> total` | `received − total` | `cash` | `0` |
| Monnaie rendue en Mobile Money | `> total` | `received − total` | `mobile_money` | `changeDue` |

Pour une vente payée en **Mobile Money** : les 4 champs restent `undefined` ; `getTodayStats` continue de la compter en `mobileAmount` via `total`.

**Invariant clé** — espèces réellement conservées dans le tiroir pour une vente espèces = `total + mobileMoneyChange`.
- compte juste / monnaie en espèces → `total + 0 = total` (le client repart avec sa monnaie en cash, le net encaissé = prix).
- monnaie en Mobile Money → `total + changeDue = amountReceived` (le billet entier reste, la monnaie part par MoMo).

Donc, en sommant sur les ventes espèces de la session :
`Σ espèces gardées = Σ total + Σ mobileMoneyChange = totalCashSales + totalMobileChangeGiven`
d'où **`expectedAmount = openingAmount + totalCashSales + totalMobileChangeGiven − totalExpenses`**.
C'est pourquoi `totalCashSales` **reste sur `s.total`** (inchangé) et la monnaie MoMo devient une **ligne additive distincte** — lisible pour le manager et arithmétiquement exacte.

### Piège n°1 — revenu ≠ espèces en tiroir (NE PAS confondre)

- **Revenu** d'une vente = `total` (7 000), quel que soit le rendu de monnaie → `getTodayStats.cashAmount` reste sur `total`. **Ne pas** le modifier.
- **Espèces dans le tiroir** = `total + mobileMoneyChange` → seul ce concept change, et **uniquement** dans `cashSessions.ts` (réconciliation), via la ligne `totalMobileChangeGiven`.
- Si le dev injecte `mobileMoneyChange` dans `getTodayStats.cashAmount`, il gonflera faussement le CA → **régression**. Revenu et encaisse sont deux nombres différents.

### Piège n°2 — deux fonctions à modifier en miroir

La même ligne `totalMobileChangeGiven` + la même formule d'`expectedAmount` doivent être appliquées **dans les deux** : `calculateExpectedAmount` (affichage temps réel de l'attendu) **et** `closeSession` (écart enregistré + persistance). N'en modifier qu'une → l'attendu affiché diverge de l'écart enregistré → justification d'écart exigée à tort.

### Hors périmètre (ne pas faire ici)

- Le **verrouillage serveur** de `createSale` par une session de caisse ouverte (bug connu, gating uniquement côté UI) → **story séparée**, ne pas l'ajouter ici.
- Le **panier multi-articles**, la **remise**, les **décimales (kg/L)**, la correction du `ClientSelector` (2 args), le `slice(0,4)` produits → stories séparées.
- La **monnaie rendue sur un paiement Mobile Money** (sur-paiement MoMo) → non couvert par la demande, laisser `undefined`.
- Aucun **reçu imprimable** dans cette story (le toast enrichi suffit ici).

### Project Structure Notes

- Schémas : [`convex/schema.ts`](../../convex/schema.ts) — table `sales` (L67-92), table `cashSessions` (L126-149).
- Mutation : [`convex/sales.ts`](../../convex/sales.ts) — `createSale` (L287-424).
- Réconciliation : [`convex/cashSessions.ts`](../../convex/cashSessions.ts) — `calculateExpectedAmount` (62-140, somme L108, formule L126), `closeSession` (315-439, somme L366, formule L382, patch L393-403).
- UI vente : [`src/components/dashboard/QuickSalePanel.tsx`](../../src/components/dashboard/QuickSalePanel.tsx) — états L14-19, `handleSale` L44-77, `canSell` L88, bloc paiement L213-246.
- UI clôture (affichage de la monnaie MoMo) : [`src/components/cash/CloseSessionModal.tsx`](../../src/components/cash/CloseSessionModal.tsx) — récap L131-187.
- Aucune variance de structure : on étend l'existant, on ne crée aucun nouveau module.

### Tests (pas de harnais automatisé dans ce projet)

`package.json` n'a pas de script `test` ni de framework. Validation = **build + plan manuel**. Ouverture supposée = 50 000 dans les exemples.

1. **Build** : `npm run build` (TS strict via `tsc -b`) → 0 erreur. `npx convex dev` → 2 schémas déployés.
2. **Scénario A — Compte juste (cash)** : vente 7 000, reçu 7 000 → monnaie 0, pas de sélecteur de rendu. Attendu = 50 000 + 7 000 = **57 000**.
3. **Scénario B — Monnaie en espèces** : vente 7 000, reçu 10 000, rendu **Espèces** → monnaie 3 000, `mobileMoneyChange = 0`. Attendu = 50 000 + 7 000 + 0 = **57 000** (inchangé).
4. **Scénario C — Monnaie en Mobile Money (cas cible)** : vente 7 000, reçu 10 000, rendu **Mobile Money** → monnaie 3 000, `mobileMoneyChange = 3 000`. Attendu = 50 000 + 7 000 + 3 000 = **60 000** ; clôture à 60 000 → **écart = 0** (avant cette story : écart fantôme +3 000). Le récap affiche la ligne « Monnaie rendue (Mobile Money) : +3 000 ».
5. **Scénario D — Mobile Money** : vente payée Mobile Money → pas de champ « Montant reçu », comportement identique à l'actuel ; n'entre pas dans l'attendu espèces.
6. **Non-régression** : une vente créée avant la story (sans `mobileMoneyChange`) reste comptée à `total` et n'ajoute rien à `totalMobileChangeGiven`.

### References

- [Source: convex/cashSessions.ts#L126] et [#L382] Formule d'attendu (les 2 endroits à modifier).
- [Source: convex/cashSessions.ts#L108] et [#L366] `totalCashSales` (reste sur `s.total`, on ajoute `totalMobileChangeGiven` à côté).
- [Source: convex/cashSessions.ts#L393-L403] Patch de session à la clôture (persister `totalMobileChangeGiven`).
- [Source: convex/sales.ts#L360] `total = product.price * quantity` (point d'insertion des dérivés).
- [Source: convex/sales.ts#L124-L126] `getTodayStats` (revenu par mode — NE PAS modifier).
- [Source: src/components/dashboard/QuickSalePanel.tsx#L44-L88] `handleSale` et `canSell`.
- [Source: src/components/cash/CloseSessionModal.tsx#L131-L187] Récap de caisse (où ajouter la ligne).
- [Source: docs/SPECIFICATION.md#L16] « Paiements : Espèces + Mobile Money (comptant uniquement) ».

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — workflow bmad-dev-story.

### Debug Log References

- `npx convex codegen` → types `_generated` régénérés (nouveaux args/retours de mutation + champ de session).
- `npm run build` (`tsc -b && vite build`) → **0 erreur** (seul avertissement : taille de chunk, préexistant et hors périmètre).
- `npx eslint` sur les 5 fichiers modifiés → **0 erreur** (exit 0).
- Avertissements IDE « suggestCanonicalClasses » (Tailwind) : stylistiques, cohérents avec la convention hex déjà utilisée partout dans ces fichiers — non corrigés volontairement.

### Completion Notes List

- **AC1-3 (UI)** : bloc « Montant reçu » affiché uniquement en paiement Espèces, avec input + chips (Compte juste / 500 / 1000 / 2000 / 5000 / 10000), « Monnaie à rendre » en grand, message « Montant insuffisant » bloquant, et sélecteur « Rendre la monnaie en : Espèces / Mobile Money » visible seulement si monnaie > 0.
- **AC4 (traçabilité)** : `createSale` accepte `amountReceived` + `changeMethod`, valide `amountReceived ≥ total` et exige `changeMethod` si monnaie > 0, dérive et stocke `amountReceived`, `changeDue`, `changeMethod`, `mobileMoneyChange`. Mobile Money : aucun champ stocké.
- **AC5 (réconciliation)** : `expectedAmount = ouverture + totalCashSales + totalMobileChangeGiven − totalExpenses`, appliqué **à l'identique** dans `calculateExpectedAmount` et `closeSession`. `totalCashSales` inchangé (`Σ total`). Repli `?? 0` → ventes legacy strictement neutres. Vérifié sur les 5 scénarios du plan de test (compte juste, monnaie espèces, monnaie MoMo, paiement MoMo, vente legacy).
- **AC6 (affichage manager)** : ligne « Monnaie rendue (Mobile Money) — gardée en caisse » (+montant) ajoutée au récap de `CloseSessionModal` (visible si > 0) ; `totalMobileChangeGiven` persisté sur la session à la clôture et renvoyé par les deux fonctions de caisse.
- **AC7 (non-régression)** : `getTodayStats` **non modifié** (revenu = `total`). Flux Mobile Money inchangé. Build + lint OK.
- ⚠️ **Changement de comportement à valider en revue** : un paiement **Espèces** exige désormais la saisie du montant reçu (le bouton Valider reste désactivé tant qu'aucun montant ≥ total n'est saisi). Le chip « Compte juste » couvre le cas du paiement exact en un tap. Conforme à la demande de traçabilité ; si un mode « validation rapide sans saisie » est souhaité, le prévoir en complément.
- Vérification **manuelle en conditions réelles non effectuée** (pas d'exécution de l'app live ici) : validation par build/types/lint + revue logique des scénarios. Le plan de test manuel de la story reste à dérouler avant mise en production.

### File List

- `convex/schema.ts` — table `sales` : +`amountReceived`, `changeDue`, `changeMethod`, `mobileMoneyChange` (optionnels) ; table `cashSessions` : +`totalMobileChangeGiven` (optionnel).
- `convex/sales.ts` — `createSale` : nouveaux args, dérivation encaissement/monnaie, persistance, retour enrichi.
- `convex/cashSessions.ts` — `calculateExpectedAmount` + `closeSession` : `totalMobileChangeGiven`, nouvelle formule d'attendu, persistance + retours.
- `src/components/dashboard/QuickSalePanel.tsx` — états + UI montant reçu/monnaie/moyen de rendu, `canSell`, `handleSale`, resets.
- `src/components/cash/CloseSessionModal.tsx` — ligne « Monnaie rendue (Mobile Money) » dans le récap.
- `convex/_generated/*` — régénérés par codegen.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-13 | 0.1 | Création de la story (analyse des manques → quick win Ventes) | Claude Opus 4.8 |
| 2026-06-13 | 0.2 | Décision « affichage manager » : décomposition `totalMobileChangeGiven` (ligne additive) au lieu de remplacer `totalCashSales` | Claude Opus 4.8 |
| 2026-06-13 | 1.0 | Implémentation complète (6 tâches), build/lint/codegen OK, statut → review | Claude Opus 4.8 |
