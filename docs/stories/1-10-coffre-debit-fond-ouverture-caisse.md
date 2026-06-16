# Story 1.10 : Bug — l'ouverture directe de caisse ne débite pas le coffre

Status: review

<!-- Bug rapporté par l'utilisateur (pas d'epics.md dans ce projet).
     Domaine : Caisse / Coffre (epic 1). Numéro suivant disponible : 1-10.
     Validation optionnelle : lancer validate-create-story avant dev-story. -->

## Story

En tant que **administrateur·rice / manager qui gère le coffre**,
je veux **que le fond de caisse remis à l'ouverture d'une caisse soit retiré du coffre au moment de l'ouverture**,
afin que **le solde du coffre reflète à tout instant l'argent réellement présent dedans, et qu'il ne se gonfle pas artificiellement à chaque cycle ouverture → clôture → versement.**

### Contexte métier (le « pourquoi » exact)

Chez LOCAGRI, l'argent du fond de caisse **provient physiquement du coffre**. Quand on ouvre une caisse avec un fond (ex. 50 000 FCFA), ces 50 000 sortent du coffre et vont dans le tiroir du caissier. Le solde du coffre **doit donc baisser de 50 000 immédiatement**.

> Citation utilisateur : « On ouvre la caisse avec un solde de caisse. Lorsqu'on ouvre avec le solde de caisse, l'argent provient du coffre. Donc la somme remise au caissier par l'admin provient du coffre mais celui-ci ne change pas en ce moment. »

**Ce qui se passe réellement aujourd'hui — deux chemins d'ouverture, un seul débite le coffre :**

| Chemin d'ouverture | Qui l'emprunte | Débite le coffre ? |
|--------------------|----------------|--------------------|
| Demande de fond → approbation : [`approveFundRequest`](../../convex/safe.ts#L582) | **Caissiers** (le provider les y route quand le coffre est actif) | ✅ Oui ([`safe.ts:639,652-657`](../../convex/safe.ts#L639) : `−amount` + transaction `withdrawal`) |
| Ouverture directe : [`openSession`](../../convex/cashSessions.ts#L285) via [`OpenSessionModal`](../../src/components/cash/OpenSessionModal.tsx) | **Admin / manager** (le provider les y route, cf. [`CashSessionProvider.tsx:106-115`](../../src/components/cash/CashSessionProvider.tsx#L106) et le commentaire L107 « admin/manager saisissent directement leur fond ») | ❌ **Non — aucune ligne ne touche le coffre** |

### Pourquoi c'est un vrai bug (et pas seulement cosmétique) : le coffre se gonfle à chaque cycle

La **clôture débite déjà symétriquement** : [`closeSession`](../../convex/cashSessions.ts#L370) crée un versement en attente **pour tous les rôles** dès qu'un coffre existe ([`cashSessions.ts:435`](../../convex/cashSessions.ts#L435), aucun filtre de rôle), puis [`confirmDeposit`](../../convex/safe.ts#L844) **ajoute le montant versé au coffre** ([`safe.ts:891-898`](../../convex/safe.ts#L891)).

Donc, pour un cycle admin/manager (fond 50 000, ventes espèces 7 000, clôture déclarée 57 000) :

| Étape | Effet attendu sur le coffre | Effet réel aujourd'hui |
|-------|-----------------------------|------------------------|
| Ouverture (fond 50 000 sort du coffre) | **−50 000** | **0** (bug) |
| Clôture + versement confirmé (57 000 rentrent au coffre) | **+57 000** | **+57 000** |
| **Net sur le cycle** | **+7 000** (= bénéfice espèces réel) | **+57 000** |

→ **Le coffre est sur-évalué de 50 000 (le montant du fond) à chaque cycle d'admin/manager.** Le bug est donc à la fois visible immédiatement (le solde ne baisse pas à l'ouverture) **et** cumulatif (dérive à la hausse à chaque journée).

## Acceptance Criteria

1. **Débit du coffre à l'ouverture directe** — Quand `openSession` réussit **et qu'un coffre est initialisé**, le solde du coffre est réduit de `openingAmount` au sein de la **même mutation transactionnelle** que la création de la session. Le solde affiché sur la page Coffre baisse immédiatement du montant du fond.
2. **Traçabilité dans l'historique du coffre** — L'opération enregistre une transaction `safeTransactions` de `type: "withdrawal"` avec `amount = openingAmount`, `previousBalance`/`newBalance` corrects, `performedById/Name` = l'utilisateur qui ouvre, `relatedUserId/Name` = ce même utilisateur, `relatedSessionId` = la session créée, et un `reason` explicite (ex. « Fond de caisse (ouverture directe) — {nom} »). La ligne apparaît dans l'**Historique des mouvements** du coffre, badge **Retrait**, en rouge.
3. **Pas de débit quand il n'y a pas de coffre** — Si le coffre **n'est pas initialisé** (`safe` absent), `openSession` se comporte **exactement comme aujourd'hui** : création de session sans aucune opération coffre, aucune erreur. (Strictement aucune régression sur les déploiements sans coffre.)
4. **Solde insuffisant : on bloque l'ouverture** — Si le coffre est initialisé et `openingAmount > safe.currentBalance`, `openSession` lève une erreur (`throw new Error("Le fond dépasse le solde du coffre")`) et **n'ouvre pas** la caisse (mutation transactionnelle : rien n'est créé, aucun débit n'est passé). Le coffre ne peut donc **jamais** devenir négatif. Garde calquée sur [`recordBankDeposit`](../../convex/safe.ts#L476). Cas limite : `openingAmount === currentBalance` est autorisé (coffre ramené à 0). Côté UI, le bouton « Ouvrir la caisse » est désactivé tant que le montant dépasse le solde du coffre.
5. **Cycle équilibré (cœur du correctif)** — Pour un cycle admin/manager complet (ouverture → ventes → clôture → versement confirmé), l'effet net sur le coffre est `closingAmount − openingAmount` (et non `+closingAmount`). Vérifié sur le scénario 50 000 / 7 000 / 57 000 → net coffre **+7 000** (avant correctif : +57 000).
6. **Aucune double-imputation pour les caissiers** — Le chemin caissier (`requestCashFund` → `approveFundRequest`) reste l'**unique** débit de leur fond ; il n'est **pas** modifié. Comme le provider ne présente jamais `OpenSessionModal` aux caissiers quand le coffre est actif ([`CashSessionProvider.tsx:110`](../../src/components/cash/CashSessionProvider.tsx#L110)), le nouveau débit de `openSession` ne s'applique en pratique qu'aux admin/manager (et reste neutre si le coffre est absent). **Aucun fond n'est débité deux fois.**
7. **Aucune régression** — `npm run build` (`tsc -b`) et le déploiement Convex passent. Le flux caissier (demande/approbation/clôture/versement), la réouverture de caisse ([`reopenSession`](../../convex/cashSessions.ts#L487)) et les ventes restent inchangés. La symétrie ouverture/clôture est cohérente (les deux gardées par « si `safe` existe »).

## Tasks / Subtasks

- [x] **Task 1 — Débiter le coffre dans `openSession` (+ blocage si insuffisant)** (AC: 1, 2, 3, 4) — [`convex/cashSessions.ts:285-399`](../../convex/cashSessions.ts#L285)
  - [x] Récupérer le coffre tôt, juste après le calcul de `now` : `const safe = await ctx.db.query("safe").first();` ([ligne 342](../../convex/cashSessions.ts#L342)).
  - [x] **Blocage solde insuffisant (AC4)** — `if (safe && args.openingAmount > safe.currentBalance) { throw new Error("Le fond dépasse le solde du coffre"); }` ([lignes 343-345](../../convex/cashSessions.ts#L343)), **avant** l'`insert("cashSessions", …)`. `>` strict → `openingAmount === currentBalance` autorisé.
  - [x] Après l'`insert("cashSessions", …)` ([ligne 348](../../convex/cashSessions.ts#L348)) et **avant** le `writeAuditLog`, débit du coffre **uniquement si `safe` existe** ([lignes 357-380](../../convex/cashSessions.ts#L357)), calqué sur [`approveFundRequest`](../../convex/safe.ts#L652-L672) :
    - `const newSafeBalance = safe.currentBalance - args.openingAmount;` + `ctx.db.patch(safe._id, {...})` + `ctx.db.insert("safeTransactions", { type: "withdrawal", …, relatedSessionId: sessionId, reason: "Fond de caisse (ouverture directe) — {nom}", … })`.
  - [x] `now`, `user` et `writeAuditLog` réutilisés (timestamp partagé session/débit/transaction).
  - [x] Retour de la mutation enrichi avec `newSafeBalance` (`undefined` si pas de coffre) ([ligne 396](../../convex/cashSessions.ts#L396)).
  - [x] Audit : on s'appuie sur la transaction `safeTransactions` (source de vérité de l'historique coffre) ; l'audit `session.opened` existant est conservé tel quel, pas de doublon.

- [x] **Task 2 — Empêcher la saisie d'un fond > solde du coffre** (AC: 4) — [`src/components/cash/OpenSessionModal.tsx`](../../src/components/cash/OpenSessionModal.tsx)
  - [x] `const safeStatus = useQuery(api.safe.getSafeStatus)` (renvoie `null` sans coffre / pour un caissier → aucun blocage, AC3).
  - [x] Dérivé `exceedsSafe` ; message inline rouge « Le fond dépasse le solde du coffre ({solde} FCFA) » + **bouton désactivé** (`disabled={… || exceedsSafe}`), style calqué sur les avertissements de `SafeManagement`.
  - [x] `try/catch` conservé : l'erreur serveur reste affichée via `toast.error` ; garde aussi ajoutée dans `handleSubmit` (`if (exceedsSafe) { toast.error(...); return }`). Le serveur reste la source de vérité.
  - [x] Solde du coffre disponible affiché dans le modal + `DialogDescription` adaptée (« Ce montant sera retiré du coffre ») quand `safeStatus != null` ; wording `fundRequestApproved` inchangé.
  - [x] Provider [`CashSessionProvider.tsx`](../../src/components/cash/CashSessionProvider.tsx) **non modifié** : routage inchangé.

- [x] **Task 3 — Vérification** (AC: 5, 6, 7) — *(pas de framework de test automatisé : voir Dev Notes › Tests)*
  - [x] `npm run build` (`tsc -b && vite build`) → **0 erreur** (seul avertissement : taille de chunk, préexistant et hors périmètre). `npx eslint` sur les 2 fichiers modifiés → **exit 0**.
  - [x] Scénarios A→E revus logiquement et validés par types/build (voir Completion Notes). ⚠️ Exécution **live** dans l'app non réalisée ici (déploiement Convex non configuré dans cet environnement : `npx convex codegen/dev` requiert `CONVEX_DEPLOYMENT`). Plan manuel à dérouler par l'utilisateur avant mise en production.

## Dev Notes

### Architecture & contraintes (à respecter)

- **Stack** : React 19 + Vite, Convex `^1.31.6`, Clerk (auth + rôles `admin`/`manager`/`cashier`), Tailwind v4. Devise FCFA, entiers. Source de vérité du coffre : table `safe` (un seul document) + journal `safeTransactions`.
- **Le coffre a UNE seule source de vérité, modifiée par 5 mutations** : [`initializeSafe`](../../convex/safe.ts#L302), [`adjustSafe`](../../convex/safe.ts#L370), [`recordBankDeposit`](../../convex/safe.ts#L446), [`approveFundRequest`](../../convex/safe.ts#L582) (−), [`confirmDeposit`](../../convex/safe.ts#L844) (+). **Ce correctif ajoute un 6ᵉ point de débit, dans `openSession`, en respectant exactement le même invariant** : `patch(safe)` + `insert(safeTransactions)` dans la même mutation, jamais l'un sans l'autre.
- **Atomicité** : les mutations Convex sont transactionnelles. Tout (création de session + débit coffre + transaction) doit rester **dans la même mutation `openSession`** — ne pas extraire de mutation séparée, ne pas appeler `ctx.runMutation` vers `safe.ts`.
- **Pas de changement de schéma** : `safeTransactions` possède déjà `type: "withdrawal"` ([`schema.ts:299`](../../convex/schema.ts#L299)) et les champs `relatedUserId/Name/SessionId` ([`schema.ts:309-311`](../../convex/schema.ts#L309)). Aucune migration.

### Le correctif, formalisé (symétrie ouverture / clôture)

Pour un coffre **initialisé**, le cycle de vie d'un fond doit être un aller-retour équilibré :

| Événement | Mutation | Effet coffre | Transaction |
|-----------|----------|--------------|-------------|
| Ouverture (fond sort) | `openSession` *(à corriger)* / `approveFundRequest` *(déjà OK)* | `− openingAmount` | `withdrawal` |
| Clôture (déclaration) | `closeSession` | aucun (crée `pendingDeposits`) | — |
| Versement confirmé (fond + recette rentrent) | `confirmDeposit` | `+ actualAmount` | `deposit` |

**Invariant** : net coffre sur un cycle = `actualAmount(versé) − openingAmount(fond)` = le résultat espèces réel de la journée. Aujourd'hui, la branche `openSession` casse cet invariant car elle saute la 1ʳᵉ ligne (`− openingAmount`).

### Piège n°1 — ne PAS double-débiter le caissier

`approveFundRequest` **crée déjà la session ET débite** le coffre en une fois. Le caissier n'appelle jamais `openSession` quand le coffre est actif (le provider lui affiche `CashierFundRequest`, pas `OpenSessionModal` — [`CashSessionProvider.tsx:110,142`](../../src/components/cash/CashSessionProvider.tsx#L110)). Donc le nouveau débit de `openSession` :
- s'applique aux **admin/manager** (qui passent par `OpenSessionModal`) → comportement voulu ;
- est **neutre** quand le coffre n'existe pas (garde `if (safe)`) → aucune régression sur déploiement sans coffre ;
- ne touche **pas** `approveFundRequest` → le fond du caissier reste débité **une seule fois**.

Le débit dans `openSession` est volontairement **agnostique au rôle** (toute ouverture directe prend de l'argent au coffre), mais il n'est atteint en pratique que par les admin/manager du fait du routage UI. Ne pas tenter de filtrer par rôle dans la mutation.

### Piège n°2 — réouverture de caisse (`reopenSession`)

[`reopenSession`](../../convex/cashSessions.ts#L487) **n'appelle pas** `openSession` : il `patch` une session existante en `status:"open"`. Il ne doit donc **pas** re-débiter le coffre — et c'est déjà le cas, on n'y touche pas.
- Réouverture **avant** versement confirmé : le fond initial est toujours « sorti », `reopenSession` supprime le `pendingDeposits` sans toucher le coffre → cohérent.
- Réouverture **après** versement confirmé : `reopenSession` supprime la session et exige un **nouveau** fond. L'admin/manager rouvre alors via `OpenSessionModal` → `openSession` re-débite (nouvel argent réellement sorti) → correct, pas de double-débit (le précédent fond a déjà été ré-encaissé via `confirmDeposit`).

### Hors périmètre (ne pas faire ici)

- **Correction rétroactive des coffres déjà gonflés** par les ouvertures admin/manager passées : pas de migration de données. L'admin pourra recaler le solde via [`adjustSafe`](../../convex/safe.ts#L370) (transaction `adjustment` tracée). À signaler à l'utilisateur, hors code.
- **Empêcher un caissier d'appeler `openSession` directement** (durcissement d'autorisation pour forcer le flux demande→approbation) : l'UI l'empêche déjà ; verrouillage serveur = story séparée. *(Décision utilisateur : hors périmètre.)*
- La logique d'**encaissement / monnaie rendue** (story [1.1](1-1-encaissement-monnaie-rendue.md)) : sans rapport, ne pas y toucher.

### Project Structure Notes

- Mutation à corriger : [`convex/cashSessions.ts`](../../convex/cashSessions.ts) — `openSession` (L285-365 ; insertion session L340-347, `now` L337, `user` L296-299, retour L359-363).
- Patron de débit à recopier : [`convex/safe.ts`](../../convex/safe.ts) — `approveFundRequest` (L634-672 : `isLowBalance` L635, `newSafeBalance` L639, `patch(safe)` L652-657, `insert(safeTransactions)` L660-672).
- Symétrie côté clôture (à ne PAS modifier, pour comprendre l'équilibre) : `closeSession` crée `pendingDeposits` ([L435-444](../../convex/cashSessions.ts#L435)) ; `confirmDeposit` crédite ([`safe.ts:891-915`](../../convex/safe.ts#L891)).
- UI : [`src/components/cash/OpenSessionModal.tsx`](../../src/components/cash/OpenSessionModal.tsx) (appel `openSession` L53, descriptions L82-87) ; routage [`src/components/cash/CashSessionProvider.tsx`](../../src/components/cash/CashSessionProvider.tsx#L106-L115) (à ne pas modifier) ; affichage du solde coffre [`src/components/safe/SafeManagement.tsx:402`](../../src/components/safe/SafeManagement.tsx#L402).
- Schéma (déjà suffisant) : [`convex/schema.ts`](../../convex/schema.ts) — `safe` (L286-291), `safeTransactions` (L296-317). **Aucune modification de schéma.**

### Tests (pas de harnais automatisé dans ce projet)

`package.json` n'a pas de script `test`. Validation = **build + plan manuel**. Pré-requis : un compte **admin**, coffre initialisé (ex. 500 000).

1. **Build** : `npm run build` → 0 erreur. `npx convex dev` → déploiement OK (pas de nouveau champ).
2. **Scénario A — Débit immédiat (cas cible)** : en admin, page Coffre = 500 000. Ouvrir une caisse avec fond **50 000**. → Le solde du coffre passe à **450 000** *immédiatement* ; l'historique affiche un **Retrait** de 50 000 (« Fond de caisse (ouverture directe) »).
3. **Scénario B — Cycle équilibré** : depuis l'état A (coffre 450 000), faire une vente espèces 7 000, clôturer en déclarant **57 000**, puis confirmer le versement (57 000) sur la page Coffre. → Coffre = 450 000 + 57 000 = **507 000** (= 500 000 de départ + 7 000 de recette). Avant correctif on aurait eu 557 000.
4. **Scénario C — Caissier non double-débité** : en caissier, demander un fond ; en admin, l'approuver à 50 000. → Coffre −50 000 **une seule fois** (transaction `withdrawal` liée au caissier). Aucune `OpenSessionModal` n'apparaît au caissier, donc aucun second débit.
5. **Scénario D — Sans coffre (non-régression)** : sur un déploiement où le coffre n'est **pas** initialisé, ouvrir une caisse. → Aucune erreur, aucune tentative de débit ; comportement identique à avant.
6. **Scénario E — Fond > solde du coffre (blocage, AC4)** : coffre à 30 000, tenter d'ouvrir une caisse avec fond **50 000**. → Le bouton « Ouvrir la caisse » est **désactivé** (message inline) ; un appel forcé renvoie l'erreur « Le fond dépasse le solde du coffre » et **aucune** session n'est créée, **aucun** débit n'est passé. Cas limite : fond **30 000** (= solde) est **autorisé** → coffre ramené à 0.

### References

- [Source: convex/cashSessions.ts#L285] `openSession` — point unique du correctif (ajouter le débit après l'insert de session).
- [Source: convex/safe.ts#L634-L672] `approveFundRequest` — patron exact du débit coffre (`withdrawal`) à recopier.
- [Source: convex/cashSessions.ts#L435] et [Source: convex/safe.ts#L891] Symétrie de la clôture/versement (pourquoi le coffre se gonfle sans le débit d'ouverture).
- [Source: src/components/cash/CashSessionProvider.tsx#L106-L115] Routage admin/manager → `openSession` (commentaire L107 : « admin/manager saisissent directement leur fond »).
- [Source: convex/schema.ts#L296-L317] `safeTransactions` — `type:"withdrawal"` et champs `relatedUser*` déjà présents (aucune migration).

## Décisions (clarifiées avec l'utilisateur)

1. **Coffres déjà gonflés** → **Recalage manuel** via [`adjustSafe`](../../convex/safe.ts#L370) (transaction `adjustment` tracée). Pas d'outil de rattrapage automatique : la story corrige uniquement le flux à partir de maintenant. *(Action hors code : informer l'admin de recaler le solde du coffre après déploiement.)*
2. **Fond > solde du coffre** → **Bloquer l'ouverture** (le coffre ne peut jamais devenir négatif). Intégré : AC4 + Task 1 (throw serveur, garde calquée sur `recordBankDeposit`) + Task 2 (désactivation du bouton côté UI).
3. **Verrou serveur caissier sur `openSession`** → **Hors périmètre** (l'UI empêche déjà les caissiers d'y accéder ; durcissement = story séparée).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — workflow bmad-dev-story.

### Debug Log References

- `npm run build` (`tsc -b && vite build`) → **0 erreur** (4070 modules ; seul avertissement : taille de chunk `index-*.js` > 500 kB, préexistant et hors périmètre).
- `npx eslint convex/cashSessions.ts src/components/cash/OpenSessionModal.tsx` → **exit 0**.
- `npx convex codegen` non exécutable ici (`CONVEX_DEPLOYMENT` non configuré) ; sans impact : aucune nouvelle fonction/fichier Convex, les types `_generated` existants suffisent et `tsc` infère le nouveau type de retour de `openSession` depuis la source (build vert le confirme).

### Completion Notes List

- **AC1-2 (débit + traçabilité)** : `openSession` débite le coffre de `openingAmount` et insère une transaction `safeTransactions` `type:"withdrawal"` (`relatedUserId/Name` = l'utilisateur qui ouvre, `relatedSessionId` = la session créée, `reason` = « Fond de caisse (ouverture directe) — {nom} »), le tout dans la même mutation transactionnelle. Le débit apparaît dans l'historique du coffre (badge Retrait).
- **AC3 (pas de coffre → inchangé)** : tout le bloc est gardé par `if (safe)`. Sans coffre initialisé, aucune lecture/écriture coffre, comportement strictement identique à l'existant.
- **AC4 (blocage)** : garde serveur `if (safe && args.openingAmount > safe.currentBalance) throw` **avant** toute écriture (rollback transactionnel) ; `>` strict autorise `openingAmount === currentBalance` (coffre ramené à 0). Côté UI, `OpenSessionModal` charge `getSafeStatus`, calcule `exceedsSafe`, affiche un message rouge et **désactive** le bouton ; garde miroir dans `handleSubmit`.
- **AC5 (cycle équilibré)** : ouverture `−openingAmount` (nouveau) + versement confirmé `+actualAmount` (`confirmDeposit`, inchangé) ⇒ net coffre = `actualAmount − openingAmount`. Sur l'exemple 50 000/7 000/57 000 : net **+7 000** (avant : +57 000).
- **AC6 (pas de double-débit caissier)** : `approveFundRequest` non modifié ; le débit `openSession` est agnostique au rôle mais n'est atteint en pratique que par les admin/manager (le provider route les caissiers vers `CashierFundRequest`). Côté UI, `getSafeStatus` renvoie `null` pour un caissier → aucun blocage parasite.
- **AC7 (non-régression)** : build + lint OK ; aucun changement de schéma ; `reopenSession`, `closeSession`, ventes et flux caissier inchangés. Symétrie ouverture/clôture cohérente (toutes deux gardées par « si `safe` existe »).
- ⚠️ **À faire hors code (rappel décision n°1)** : après déploiement, recaler le solde du coffre via *Ajuster* (page Coffre) pour corriger la sur-évaluation accumulée par les ouvertures admin/manager passées (pas de migration automatique).
- ⚠️ **Vérification live non effectuée ici** : validation par build/types/lint + revue logique des 5 scénarios (A→E). Dérouler le plan de test manuel dans l'app avant la prod.

### File List

- `convex/cashSessions.ts` — `openSession` : récupération du coffre + blocage si fond > solde, débit du coffre (patch + transaction `withdrawal`) dans la même mutation, retour enrichi (`newSafeBalance`).
- `src/components/cash/OpenSessionModal.tsx` — `useQuery(getSafeStatus)`, dérivé `exceedsSafe`, message inline + désactivation du bouton, garde dans `handleSubmit`, affichage du solde coffre, `DialogDescription` adaptée ; imports `useQuery` et `AlertTriangle`.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-16 | 0.1 | Création de la story (bug : ouverture directe de caisse ne débite pas le coffre ; clarifié avec l'utilisateur que le sujet est le coffre, pas la monnaie rendue) | Claude Opus 4.8 |
| 2026-06-16 | 0.2 | Décisions utilisateur intégrées : (1) recalage manuel via `adjustSafe`, (2) **bloquer** l'ouverture si fond > solde du coffre (AC4/Task1/Task2 mis à jour), (3) verrou caissier hors périmètre | Claude Opus 4.8 |
| 2026-06-16 | 1.0 | Implémentation (Task 1 serveur + Task 2 UI), build/lint OK, statut → review | Claude Opus 4.8 |
