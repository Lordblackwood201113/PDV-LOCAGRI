# Story 1.11 : Bug — la réouverture de caisse ne repasse pas par le coffre (nouveau fond admin requis)

Status: review

<!-- Bug rapporté par l'utilisateur, suite directe de la story 1.10 (pas d'epics.md dans ce projet).
     Domaine : Caisse / Coffre (epic 1). Numéro suivant disponible : 1-11.
     Validation optionnelle : lancer validate-create-story avant dev-story. -->

## Story

En tant que **administrateur·rice / manager qui gère le coffre**,
je veux **que la réouverture d'une caisse clôturée exige un nouveau fond validé (et retiré du coffre), au lieu de rouvrir silencieusement l'ancienne session**,
afin que **le coffre reste juste : reprendre le travail après une clôture consomme à nouveau de l'argent du coffre, exactement comme une ouverture normale.**

### Contexte métier (le « pourquoi » exact)

Décision métier confirmée : **à la clôture, tout l'argent du tiroir (fond + recette) retourne au coffre.** Une caisse clôturée = le caissier n'a plus rien en main. Donc, pour **reprendre le travail**, il lui faut **un nouveau fond pris dans le coffre et validé par un responsable** — comme au début d'une journée.

> Citation utilisateur : « Le problème persiste, lorsqu'on réouvre une caisse qu'on a précédemment fermée. On doit toujours demander à l'admin de valider le solde d'ouverture de caisse et le retirer du coffre. »

C'est le **prolongement de la story [1.10](1-10-coffre-debit-fond-ouverture-caisse.md)** (qui fait débiter le coffre à l'ouverture). Le chemin de **réouverture** échappe encore à cette règle.

### Ce qui se passe réellement aujourd'hui — `reopenSession` a deux branches

[`reopenSession`](../../convex/cashSessions.ts#L521) (déclenché par le bouton « Rouvrir la caisse » de [`SalesPage.tsx:226`](../../src/pages/SalesPage.tsx#L226)) :

| Cas (coffre actif) | Comportement actuel | Correct ? |
|--------------------|---------------------|-----------|
| Versement déjà **confirmé** ([`cashSessions.ts:585-601`](../../convex/cashSessions.ts#L585)) | Supprime la session → `needsNewFundRequest: true` → le caissier redemande un fond → l'admin valide → **coffre débité**. | ✅ |
| Versement **pas encore confirmé** ([`cashSessions.ts:605-616`](../../convex/cashSessions.ts#L605)) | **Rouvre silencieusement** l'ancienne session avec le **même `openingAmount`**, **supprime le versement en attente** ([`:579-581`](../../convex/cashSessions.ts#L579)), **ne touche pas au coffre**, **aucune validation admin**. | ❌ |

**Deux problèmes dans la 2ᵉ branche :**

1. **Pas de nouveau fond / pas de débit coffre** — la caisse rouvre avec un fond que le caissier n'a plus physiquement (il l'a rendu au coffre à la clôture), sans repasser par l'admin ni débiter le coffre. C'est exactement ce que l'utilisateur signale.
2. **Le versement en attente est supprimé** ([`:579-581`](../../convex/cashSessions.ts#L579)) → la recette rendue au coffre **n'est jamais créditée** (le `pendingDeposits` disparaît avant que l'admin ne le confirme) → le coffre est **sous-évalué** de la recette de la session rouverte.

## Acceptance Criteria

1. **Réouverture = nouveau fond validé (coffre actif)** — Quand un coffre est initialisé, `reopenSession` **ne rouvre jamais** l'ancienne session : il la **clôt définitivement** (supprime la session courante comme le fait déjà la branche « versement confirmé ») et renvoie `needsNewFundRequest: true`. Le caissier est alors routé vers la **demande de fond** (→ approbation admin → débit du coffre via [`approveFundRequest`](../../convex/safe.ts#L582)) ; l'admin/manager est routé vers l'ouverture directe (→ débit du coffre via `openSession`, story 1.10). **Plus aucune réouverture silencieuse sans débit.**
2. **Réouverture bloquée tant que le versement n'est pas confirmé** — Si la caisse clôturée a un **versement en attente** (`pendingDeposits` `status:"pending"`) non confirmé, `reopenSession` **refuse** la réouverture avec une erreur explicite (« Le versement de cette caisse doit d'abord être confirmé par un responsable »). La session n'est ni supprimée ni rouverte, aucun versement n'est supprimé. La réouverture n'est possible **qu'une fois le versement confirmé** ([`confirmDeposit`](../../convex/safe.ts#L844) → coffre crédité). Ainsi la recette est toujours créditée au coffre **avant** qu'un nouveau fond n'en soit retiré.
3. **Comportement préservé sans coffre** — Si le coffre **n'est pas initialisé** (`safe` absent), la réouverture conserve le comportement actuel : on rouvre l'ancienne session (`status:"open"`, mêmes montants), aucune notion de fond/coffre. **Aucune régression** sur les déploiements sans coffre.
4. **Invariant coffre conservé sur un cycle complet** — Pour un cycle « ouverture → clôture (argent rendu) → versement confirmé → réouverture → nouveau fond » avec coffre actif, le coffre suit : `−fond₁` (ouverture), `+versement₁` (confirmation), `−fond₂` (nouveau fond). Aucun montant fantôme, aucune double imputation, aucune recette perdue.
5. **UX cohérente** — Tant que le versement de la caisse clôturée n'est pas confirmé, l'écran « Caisse clôturée » affiche « En attente de confirmation du versement par un responsable » et le bouton de réouverture est **désactivé**. Une fois le versement confirmé, la réouverture est possible : la session est fermée et le caissier voit l'écran « Demander un fond de caisse » (admin/manager : modal d'ouverture). Le toast « Demandez un nouveau fond de caisse pour reprendre le travail » ([`SalesPage.tsx:186-189`](../../src/pages/SalesPage.tsx#L186)) reste affiché dans ce cas.
6. **Aucune régression** — `npm run build` (`tsc -b`) passe. Le flux normal (ouverture, vente, clôture, versement, demande/approbation de fond) et la story 1.10 restent intacts. Aucun changement de schéma.

## Tasks / Subtasks

- [x] **Task 1 — Bloquer la réouverture tant que le versement n'est pas confirmé, sinon exiger un nouveau fond** (AC: 1, 2, 3, 4) — [`convex/cashSessions.ts:559-596`](../../convex/cashSessions.ts#L559)
  - [x] Branche `if (safe)` réécrite ([lignes 559-596](../../convex/cashSessions.ts#L559)) : recherche du versement `pending` de la session ([565-569](../../convex/cashSessions.ts#L565)) → **si présent, `throw`** « Le versement de cette caisse doit d'abord être confirmé… » ([571-575](../../convex/cashSessions.ts#L571)).
  - [x] Sinon : `ctx.db.delete(session._id)` ([581](../../convex/cashSessions.ts#L581)) + audit `session.reopened` + `return { sessionId: null, reopenedAt, needsNewFundRequest: true, message }` ([590-595](../../convex/cashSessions.ts#L590)). **Aucun `pendingDeposits` n'est supprimé** (l'ancienne suppression `:579-581` a été retirée).
  - [x] Branche « sans coffre » ([600-628](../../convex/cashSessions.ts#L600), `patch` → `status:"open"`, `needsNewFundRequest:false`) **conservée inchangée** : ne s'exécute que si `safe` absent (AC3).
  - [x] Retour compatible avec [`handleReopenSession`](../../src/pages/SalesPage.tsx#L185) (`result.needsNewFundRequest`) ; l'erreur de blocage remonte via le `toast.error` du `catch`.

- [x] **Task 2 — UI : désactiver la réouverture tant que le versement est en attente** (AC: 5) — [`src/pages/SalesPage.tsx`](../../src/pages/SalesPage.tsx)
  - [x] `const myPendingDeposit = useQuery(api.safe.getMyPendingDeposit)` + dérivé `depositPending` dans [`ClosedSessionSummary`](../../src/pages/SalesPage.tsx#L175) ; bouton « Rouvrir la caisse » **désactivé** (`disabled={isReopening || depositPending}`) + message « En attente de confirmation du versement par un responsable » (icône `AlertCircle`) quand un versement est en attente.
  - [x] `try/catch` conservé : l'erreur serveur de blocage s'affiche via `toast.error` (filet de sécurité).
  - [x] Provider **non modifié** : après suppression de la session, `getCurrentSession → null` → `needsToOpenSession` → caissier : `CashierFundRequest` ; admin/manager : `OpenSessionModal` (débit coffre, 1.10).
  - [x] Libellé optionnel « Reprendre (nouveau fond) » : non appliqué (bouton « Rouvrir la caisse » conservé pour ne pas dévier du wording existant ; comportement correct).

- [x] **Task 3 — Vérification** (AC: 4, 6) — *(pas de framework de test automatisé : voir Dev Notes › Tests)*
  - [x] `npm run build` (`tsc -b && vite build`) → **0 erreur** (seul avertissement : taille de chunk, préexistant). `npx eslint convex/cashSessions.ts src/pages/SalesPage.tsx` → **exit 0**.
  - [x] Scénarios A→D revus logiquement et validés par types/build (voir Completion Notes). ⚠️ Exécution **live** non réalisée ici (déploiement Convex non configuré dans cet environnement). Plan manuel à dérouler par l'utilisateur avant production.

## Dev Notes

### Architecture & contraintes (à respecter)

- **Pré-requis posé par la story 1.10** : `openSession` débite déjà le coffre (transaction `withdrawal`) et `approveFundRequest` aussi. **Cette story ne ré-implémente pas le débit** : elle se contente de **rediriger la réouverture vers ces flux existants** au lieu de la réouverture silencieuse.
- **Mécanisme de redirection (déjà éprouvé)** : la branche « versement confirmé » actuelle supprime la session et renvoie `needsNewFundRequest: true`. Le provider, voyant « plus de session », affiche le bon écran (demande de fond pour un caissier ; modal d'ouverture pour un admin/manager). **On généralise ce mécanisme à tous les cas quand le coffre est actif.**
- **Atomicité** : `reopenSession` reste une seule mutation transactionnelle. Aucun appel croisé vers `safe.ts`.
- **Pas de changement de schéma.** Aucune migration.

### Le correctif, formalisé (cycle équilibré avec réouverture)

Coffre actif, exemple (coffre initial 500 000 ; fond 50 000 ; recette 7 000 ; clôture 57 000) :

| Étape | Coffre (livre) | Note |
|-------|----------------|------|
| Ouverture (fond₁) | −50 000 → 450 000 | `openSession` / `approveFundRequest` (1.10) |
| Clôture | 450 000 | crée `pendingDeposits(57 000)` ; argent rendu au coffre physiquement |
| Versement confirmé | +57 000 → 507 000 | `confirmDeposit` (**obligatoire avant de pouvoir rouvrir**) |
| **Réouverture** | 507 000 | **bloquée tant que le versement est en attente** ; une fois confirmé : session supprimée, nouveau fond requis (correctif) |
| Nouveau fond₂ (50 000) | −50 000 → 457 000 | demande → admin valide → débit |

Sans le correctif, la réouverture silencieuse laisse une caisse « ouverte » avec un fond de 50 000 **non débité** (et, si le versement n'était pas confirmé, supprime la recette à créditer).

### Piège n°1 — bloquer (jamais supprimer) tant que le versement est en attente

La branche actuelle supprime le `pendingDeposits` en attente ([`:579-581`](../../convex/cashSessions.ts#L579)) puis rouvre en silence. **À retirer entièrement.** Règle voulue : tant qu'un versement est **`pending`**, la réouverture est **refusée** (l'admin doit d'abord confirmer l'argent rendu → crédit du coffre). On ne supprime **jamais** un versement ; une fois `deposited`, il n'empêche plus la réouverture. Cela garantit l'ordre correct : **recette créditée au coffre AVANT** qu'un nouveau fond n'en soit retiré (aucune recette perdue, pas de coffre sous-évalué).

### Piège n°2 — admin/manager vs caissier après réouverture

Les deux finissent par débiter le coffre, via deux écrans différents (routage du provider, inchangé) :
- **Caissier** → `showFundRequestWorkflow` → `CashierFundRequest` → `requestCashFund` → `approveFundRequest` (débit).
- **Admin/manager** → `OpenSessionModal` → `openSession` (débit, story 1.10).
Ne pas tenter de router différemment dans la mutation : `reopenSession` renvoie simplement `needsNewFundRequest: true`, l'UI fait le reste.

### Hors périmètre (ne pas faire ici)

- **Créditer automatiquement le coffre à la clôture** (fusionner clôture + confirmation de versement) : le modèle « clôture = déclaration / versement confirmé = crédit » reste volontaire (l'admin vérifie le montant réel). Hors périmètre.
- **Correction rétroactive** des caisses déjà rouvertes silencieusement / coffres faussés : recalage manuel via [`adjustSafe`](../../convex/safe.ts#L370) (cf. décision story 1.10). Pas de migration.
- **Logique d'encaissement / monnaie rendue** (story 1.1) : sans rapport.

### Project Structure Notes

- Mutation à corriger : [`convex/cashSessions.ts`](../../convex/cashSessions.ts) — `reopenSession` (L521-635 ; branche coffre L559-602, suppression session L586, retour `needsNewFundRequest` L595-600, branche silencieuse L605-633).
- Flux de débit réutilisés (NE PAS modifier) : `openSession` (L285, story 1.10), `approveFundRequest` ([`safe.ts:582`](../../convex/safe.ts#L582)), `confirmDeposit` ([`safe.ts:844`](../../convex/safe.ts#L844)).
- Routage UI (lecture) : [`CashSessionProvider.tsx`](../../src/components/cash/CashSessionProvider.tsx#L88-L120) ; bouton réouverture [`SalesPage.tsx:226`](../../src/pages/SalesPage.tsx#L226), `handleReopenSession` [L182-201](../../src/pages/SalesPage.tsx#L182).
- Schéma : `pendingDeposits` + `cashFundRequests` ([`schema.ts`](../../convex/schema.ts)). **Aucune modification.**

### Tests (pas de harnais automatisé dans ce projet)

`package.json` n'a pas de script `test`. Validation = **build + plan manuel**. Pré-requis : coffre initialisé (ex. 500 000).

1. **Build** : `npm run build` → 0 erreur ; `eslint` → 0 erreur.
2. **Scénario A — Réouverture caissier (versement confirmé)** : caissier ouvre (fond 50 000, coffre 450 000), vend 7 000, clôture (57 000), admin confirme le versement (coffre 507 000). Caissier clique « Rouvrir » → session supprimée, écran « Demander un fond » → admin valide 50 000 → coffre **457 000**. Aucune caisse rouverte avec fond fantôme.
3. **Scénario B — Réouverture bloquée (versement NON confirmé)** : même départ, mais l'admin n'a pas encore confirmé le versement. Le bouton « Rouvrir » est **désactivé** (« En attente de confirmation du versement »). Un appel forcé renvoie l'erreur de blocage et **ne supprime ni ne rouvre** rien. Une fois que l'admin confirme le versement (coffre +57 000), la réouverture redevient possible (→ Scénario A). **La recette n'est jamais perdue, le coffre est crédité avant tout nouveau fond.**
4. **Scénario C — Réouverture admin/manager** : un admin rouvre sa propre caisse → `OpenSessionModal` s'affiche → `openSession` débite le coffre du nouveau fond (story 1.10). Pas de caisse rouverte sans débit.
5. **Scénario D — Sans coffre (non-régression)** : coffre non initialisé → « Rouvrir » rouvre l'ancienne session avec le même solde, sans notion de coffre (comportement actuel inchangé).

### References

- [Source: convex/cashSessions.ts#L521-L635] `reopenSession` — point unique du correctif (unifier la branche coffre sur « nouveau fond requis »).
- [Source: convex/cashSessions.ts#L579-L581] Suppression du versement en attente — **à retirer** (Piège n°1).
- [Source: convex/cashSessions.ts#L585-L601] Branche « versement confirmé » existante — le mécanisme `needsNewFundRequest` à généraliser.
- [Source: convex/safe.ts#L582] `approveFundRequest` et [Source: convex/cashSessions.ts#L285] `openSession` — débits du coffre réutilisés (story 1.10).
- [Source: src/components/cash/CashSessionProvider.tsx#L88-L120] Routage selon `needsToOpenSession` + rôle.
- [Source: src/pages/SalesPage.tsx#L182-L234] Bouton « Rouvrir la caisse » + `handleReopenSession`.

## Décisions (clarifiées avec l'utilisateur)

1. **À la clôture, l'argent retourne au coffre** → une caisse clôturée n'a plus de cash ; reprendre exige donc un **nouveau fond validé par l'admin et retiré du coffre**. C'est le fondement de cette story (réouverture = nouveau fond, jamais une réouverture silencieuse).
2. **Versement non confirmé au moment de la réouverture** → **bloquer** la réouverture tant qu'un responsable n'a pas confirmé le versement de la caisse précédente. Intégré : AC2 + Task 1 (`throw` serveur) + Task 2 (bouton désactivé). Garantit que la recette est créditée au coffre avant qu'un nouveau fond n'en sorte.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — workflow bmad-dev-story.

### Debug Log References

- `npm run build` (`tsc -b && vite build`) → **0 erreur** (seul avertissement : taille de chunk préexistante).
- `npx eslint convex/cashSessions.ts src/pages/SalesPage.tsx` → **exit 0**.
- Pas de `npx convex codegen` (déploiement non configuré) ; sans impact : aucune nouvelle fonction/fichier, types `_generated` existants suffisants, build vert.

### Completion Notes List

- **AC1-2 (cœur)** : `reopenSession`, branche coffre actif, **bloque** la réouverture tant qu'un `pendingDeposits` `status:"pending"` de la session existe (`throw`) ; sinon **supprime la session** et renvoie `needsNewFundRequest: true` (route vers une nouvelle demande de fond / ouverture directe → débit du coffre). L'ancienne suppression du versement en attente a été **retirée** : on ne supprime jamais un versement.
- **AC3 (sans coffre)** : la branche `patch → status:"open"` est conservée à l'identique ; elle ne s'exécute que si aucun coffre n'est initialisé.
- **AC4 (invariant)** : le blocage force l'ordre `confirmDeposit` (crédit recette) **avant** tout nouveau fond (débit) ; aucun montant fantôme, aucune recette perdue, pas de double imputation.
- **AC5 (UX)** : `ClosedSessionSummary` charge `getMyPendingDeposit` ; le bouton « Rouvrir la caisse » est désactivé avec le message « En attente de confirmation du versement par un responsable » tant qu'un versement est en attente. Le serveur reste la source de vérité (erreur via `toast.error`).
- **AC6 (non-régression)** : build + lint OK ; aucun changement de schéma ; flux normal (ouverture/clôture/versement/demande de fond) et story 1.10 intacts ; provider non modifié.
- ⚠️ **Vérification live non effectuée ici** : validation par build/types/lint + revue logique des scénarios A→D. Dérouler le plan de test manuel dans l'app avant production.

### File List

- `convex/cashSessions.ts` — `reopenSession` : branche coffre actif réécrite (blocage si versement en attente, sinon suppression de session + `needsNewFundRequest`) ; suppression de l'ancien retrait du versement en attente ; branche sans-coffre inchangée.
- `src/pages/SalesPage.tsx` — `ClosedSessionSummary` : `useQuery(getMyPendingDeposit)`, dérivé `depositPending`, désactivation du bouton de réouverture + message d'attente de confirmation.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-16 | 0.1 | Création de la story (bug suite 1.10 : la réouverture de caisse ne repasse pas par le coffre ; clarifié que l'argent retourne au coffre à la clôture) | Claude Opus 4.8 |
| 2026-06-16 | 0.2 | Décision : **bloquer** la réouverture tant que le versement n'est pas confirmé (AC2/Task1/Task2 mis à jour ; ne jamais supprimer le versement en attente) | Claude Opus 4.8 |
| 2026-06-16 | 1.0 | Implémentation (Task 1 serveur + Task 2 UI), build/lint OK, statut → review | Claude Opus 4.8 |
