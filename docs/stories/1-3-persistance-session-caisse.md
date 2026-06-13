# Story 1.3 : La caisse ne se ferme pas toute seule (session persistante)

Status: review

<!-- Story issue d'une demande directe utilisateur. -->

## Story

En tant que **caissier·ère**,
je veux que **ma caisse reste ouverte tant que je ne l'ai pas clôturée moi-même, même si la journée change (minuit)**,
afin de **ne pas perdre ma session en cours et de clôturer une caisse juste, sans session orpheline.**

### Le problème (factuel)

La table `cashSessions` est indexée par `userId` + `date` (`"YYYY-MM-DD"`). Toutes les fonctions ne regardent que **le jour courant** :
- `getCurrentSession` ([`convex/cashSessions.ts:37-56`](../../convex/cashSessions.ts#L37-L56)) et `hasOpenSession` ([`:213-236`](../../convex/cashSessions.ts#L213-L236)) cherchent `userId` + `today`.
- `openSession` ([`:245-310`](../../convex/cashSessions.ts#L245-L310)) ne bloque que s'il existe une session **du jour**.
- `calculateExpectedAmount` ([`:62-140`](../../convex/cashSessions.ts#L62-L140)) et `closeSession` ([`:315-439`](../../convex/cashSessions.ts#L315-L439)) calculent l'attendu en bornant les ventes à `startOfDay(session.date) .. endOfDay(session.date)` (la **journée calendaire**).

**Conséquences** : à minuit, la session ouverte d'hier n'est plus trouvée → l'UI ([`CashSessionProvider.tsx:88-90`](../../src/components/cash/CashSessionProvider.tsx#L88-L90)) considère `needsToOpenSession` et réaffiche l'`OpenSessionModal`. Le caissier ouvre une **nouvelle** session ; l'ancienne reste « open » pour toujours (orpheline). Et si une session devait couvrir 2 jours, sa réconciliation **oublierait** les ventes du 2ᵉ jour.

### La correction (principe)

**Invariant** : un caissier a **au plus une session ouverte à la fois**, qui persiste à travers les jours **jusqu'à clôture explicite**. La réconciliation couvre **tout l'intervalle de la session** (`openedAt → closedAt/maintenant`), pas la journée calendaire.

## Acceptance Criteria

1. **Session ouverte retrouvée quel que soit le jour** — `getCurrentSession` et `hasOpenSession` retournent la session **ouverte** de l'utilisateur **si elle existe, peu importe sa date** (pas seulement aujourd'hui). À défaut de session ouverte, ils retombent sur le comportement actuel basé sur le jour (pour l'état « clôturée » / versement en attente du jour).
2. **Pas de double ouverture** — `openSession` refuse si l'utilisateur a **déjà une session ouverte** (quelle que soit sa date), avec un message clair indiquant depuis quand : « Une caisse est déjà ouverte depuis le {date} — clôturez-la avant d'en ouvrir une nouvelle. »
3. **Clôture de la session ouverte (pas celle du jour)** — `closeSession` clôture la **session ouverte** de l'utilisateur (même ouverte un jour précédent), pas « celle d'aujourd'hui ».
4. **Réconciliation sur l'intervalle de session** — `calculateExpectedAmount` et `closeSession` calculent l'attendu en filtrant les ventes du caissier sur `date >= session.openedAt` **et** `date <= (session.closedAt ?? maintenant)` (au lieu de la journée calendaire de `session.date`). Les dépenses (`withdrawnFromSessionId`) et règlements clients (`sessionId`) restent rattachés par session → inchangés. Les totaux des stories 1.1 (`totalMobileChangeGiven`) et 1.2 (`totalCashRepayments`) restent corrects.
5. **Pas de régression du flux** — Pour une session ouverte et clôturée le même jour, le comportement (attendu, écart, versement en attente, réouverture) est identique à aujourd'hui. La réouverture (`reopenSession`) et le workflow fond de caisse/coffre fonctionnent toujours.
6. **UI cohérente** — Au changement de jour, le caissier voit toujours sa session ouverte (montant d'ouverture, heure, bouton Clôturer) au lieu de l'`OpenSessionModal`. Aucune session orpheline créée. Build TypeScript + lint OK.

## Tasks / Subtasks

- [x] **Task 1 — Index pour la session ouverte** (AC: 1, 2) — [`convex/schema.ts`](../../convex/schema.ts)
  - [x] Ajouter à `cashSessions` l'index `by_user_status` (`["userId", "status"]`) pour retrouver efficacement la session ouverte d'un utilisateur, quelle que soit sa date.

- [x] **Task 2 — Helper « session ouverte »** (AC: 1, 2, 3) — [`convex/cashSessions.ts`](../../convex/cashSessions.ts)
  - [x] Ajouter un helper interne `getOpenSessionForUser(ctx, userId)` qui retourne la session de l'utilisateur avec `status === "open"` via l'index `by_user_status` (`.unique()` ; il ne doit jamais y en avoir plusieurs grâce à l'AC2).

- [x] **Task 3 — Lecture de session insensible au jour** (AC: 1, 6) — [`convex/cashSessions.ts`](../../convex/cashSessions.ts)
  - [x] `getCurrentSession` : retourner d'abord `getOpenSessionForUser(...)` si présent ; sinon, retomber sur la session du jour (`by_user_date` + today) pour l'état « clôturée du jour ».
  - [x] `hasOpenSession` : si une session ouverte existe (quel que soit le jour) → `{ hasSession: true, status: "open" }` ; sinon, comportement actuel basé sur le jour (clôturée du jour, ou aucune).

- [x] **Task 4 — Ouverture : bloquer la double caisse** (AC: 2) — [`convex/cashSessions.ts`](../../convex/cashSessions.ts) `openSession`
  - [x] Avant de créer, vérifier `getOpenSessionForUser(...)`. Si une session ouverte existe → `throw new Error("Une caisse est déjà ouverte depuis le " + <date lisible> + ". Clôturez-la avant d'en ouvrir une nouvelle.")`.
  - [x] Conserver le garde-fou actuel « déjà clôturée aujourd'hui » pour le cas même-jour.

- [x] **Task 5 — Réconciliation par intervalle de session** (AC: 3, 4, 5) — [`convex/cashSessions.ts`](../../convex/cashSessions.ts)
  - [x] Factoriser le calcul de l'attendu d'une session donnée (utilisé par `calculateExpectedAmount` et `closeSession`) : filtrer les ventes par `userId === session.userId`, `date >= session.openedAt`, `date <= (session.closedAt ?? Date.now())`. Remplacer l'usage de `getStartOfDay(session.date)`/`getEndOfDay(session.date)` pour la requête `sales`.
  - [x] `calculateExpectedAmount` (sans `sessionId`) : cibler `getOpenSessionForUser(...)` si présent, sinon la session du jour.
  - [x] `closeSession` : cibler `getOpenSessionForUser(...)` (et non « la session du jour »). Le reste (écart, justification, `pendingDeposits`, persistance des totaux) inchangé.
  - [x] Conserver intacts les calculs `totalMobileChangeGiven` (1.1), `totalCashRepayments` (1.2), dépenses (par `sessionId`).

- [x] **Task 6 — Réouverture cohérente** (AC: 5) — [`convex/cashSessions.ts`](../../convex/cashSessions.ts) `reopenSession`
  - [x] Cibler la **dernière session clôturée** de l'utilisateur (via `by_user_date` ordre desc) plutôt que « celle d'aujourd'hui », pour rester cohérent si la clôture a eu lieu un autre jour. Logique coffre/versement inchangée.

- [x] **Task 7 — Vérifier le chemin fond de caisse** (AC: 2, 5) — [`convex/safe.ts`](../../convex/safe.ts)
  - [x] Si `approveFundRequest` (ou le workflow de fond) crée une `cashSessions`, s'assurer qu'il respecte aussi l'invariant « une seule session ouverte » (réutiliser le helper / refuser si déjà ouverte). Sinon, documenter qu'il passe par `openSession`.

- [x] **Task 8 — Vérification** (AC: 6)
  - [x] `npx convex codegen` ; `npm run build` ; `npx eslint` sur les fichiers modifiés → 0 erreur.
  - [x] Dérouler le plan de test manuel (Dev Notes › Tests).

## Dev Notes

### Conception — détails

- **Une seule session ouverte par caissier** : garanti par le refus dans `openSession` (AC2) + le helper `.unique()` (AC2 garantit l'unicité, donc `.unique()` est sûr). Si des données historiques contenaient déjà plusieurs sessions ouvertes pour un même user, `.unique()` lèverait — préférer `.first()` (ordre desc par date) en filet de sécurité, et `log()`/noter l'anomalie.
- **Intervalle de session** : `start = session.openedAt` (timestamp), `end = session.closedAt ?? Date.now()`. Pour une session **ouverte**, pas de borne haute utile (les ventes sont passées) — utiliser `Date.now()` comme borne haute est sans effet de bord. Pour une session **clôturée** consultée par id, `closedAt` borne correctement (corrige un défaut latent : aujourd'hui une session clôturée est bornée à sa journée calendaire).
- **Dépenses & règlements** : déjà rattachés par `sessionId`/`withdrawnFromSessionId` → aucun changement de span nécessaire pour eux.
- **`date` conservé** : le champ `date` (jour d'ouverture) reste utile pour l'historique et l'état « clôturée du jour ». On ne le supprime pas ; on cesse seulement de s'en servir comme borne de réconciliation et comme clé d'unicité de la session ouverte.

### Pièges

- Ne pas casser l'état « clôturée + versement en attente » du même jour (l'UI s'appuie dessus via `hasOpenSession`/`getMyPendingDeposit`).
- `Date.now()` est interdit dans certains contextes de replay de workflow, mais ici on est dans des mutations/queries Convex classiques où `Date.now()` est déjà utilisé (`openSession`, `closeSession`) — OK.
- Vérifier que `calculateExpectedAmount` appelée **avec** un `sessionId` (depuis l'historique) borne bien par `closedAt`.

### Hors périmètre

- Clôture automatique programmée (cron) — explicitement non souhaitée (c'est l'inverse de la demande).
- Rappel/alerte « caisse ouverte depuis trop longtemps » (pourrait être une story d'amélioration ultérieure).
- Multi-session simultanée par caissier (non souhaitée).

### Project Structure Notes

- Backend : [`convex/cashSessions.ts`](../../convex/cashSessions.ts) (toutes les fonctions de session), [`convex/schema.ts`](../../convex/schema.ts) (index), éventuellement [`convex/safe.ts`](../../convex/safe.ts).
- UI : aucun changement obligatoire — `CashSessionProvider`/`SessionStatus`/`OpenSessionModal` consomment les mêmes queries, qui retournent désormais la session ouverte persistante. Vérifier l'affichage.

### Tests (build + plan manuel)

1. `npm run build` + `npx eslint` (fichiers modifiés) → 0 erreur. `npx convex codegen` OK.
2. **Persistance jour J→J+1 (simulée)** : ouvrir une caisse, créer une session dont `date` = hier (ou avancer l'horloge) ; vérifier que `getCurrentSession`/`hasOpenSession` la retrouvent et que l'UI affiche la session ouverte (pas l'`OpenSessionModal`).
3. **Double ouverture refusée** : tenter `openSession` avec une session déjà ouverte → erreur explicite.
4. **Réconciliation multi-jours** : session ouverte avec des ventes réparties sur 2 jours → l'attendu inclut **toutes** les ventes depuis `openedAt` ; clôture → écart correct.
5. **Même-jour (non-régression)** : ouvrir/vendre/clôturer le même jour → attendu/écart/versement identiques à avant (y compris monnaie MoMo 1.1 et règlements 1.2).
6. **Session clôturée par id** : `calculateExpectedAmount({sessionId})` d'une session clôturée n'inclut pas de ventes postérieures à `closedAt`.

### References

- [Source: convex/cashSessions.ts#L11-L28] helpers de date (`getTodayDateString`, `getStartOfDay`, `getEndOfDay`).
- [Source: convex/cashSessions.ts#L91-L104] et [#L350-L363] requêtes `sales` bornées à la journée (à remplacer par l'intervalle de session).
- [Source: convex/cashSessions.ts#L147-L149] index existants (`by_user_date`, `by_status`, `by_date`).
- [Source: src/components/cash/CashSessionProvider.tsx#L88-L90] logique `needsToOpenSession` côté UI.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story.

### Debug Log References

- `npx convex codegen` (index `by_user_status`) ; `npm run build` → 0 erreur ; `npx eslint` (3 fichiers) exit 0.

### Completion Notes List

- **AC1/6** : `getCurrentSession` et `hasOpenSession` priorisent la session **ouverte** (helper `getOpenSessionForUser`, index `by_user_status`) quel que soit le jour ; repli sur la session du jour pour l'état « clôturée du jour ».
- **AC2** : `openSession` refuse si une session ouverte existe (message avec la date d'ouverture) ; garde-fou « déjà clôturée aujourd'hui » conservé. Idem **`safe.ts:approveFundRequest`** (Task 7) : refuse d'attribuer un fond si le caissier a déjà une caisse ouverte.
- **AC3/4** : `closeSession` clôture la session **ouverte** (pas « celle du jour ») ; réconciliation factorisée dans `computeSessionReconciliation` sur l'intervalle **`openedAt → closedAt ?? now`** (plus la journée calendaire). `calculateExpectedAmount` utilise le même helper. Dépenses (`withdrawnFromSessionId`) et règlements (`sessionId`) inchangés. Totaux 1.1/1.2 préservés. Forme de retour des queries inchangée (UI intacte).
- **AC5** : `reopenSession` cible désormais la **dernière** session de l'utilisateur (ordre desc) au lieu de « celle d'aujourd'hui ». Logique coffre/versement inchangée.
- Helpers `getStartOfDay`/`getEndOfDay` supprimés (devenus inutiles) ; `getTodayDateString` conservé.
- ⚠️ Vérification manuelle live non effectuée (validation build/types/lint + revue). Dérouler le plan de test (notamment simulation jour J→J+1 et réconciliation multi-jours) avec `npx convex dev` avant prod.

### File List

- `convex/schema.ts` — index `cashSessions.by_user_status`.
- `convex/cashSessions.ts` — helpers `getOpenSessionForUser` + `computeSessionReconciliation` ; refonte de `getCurrentSession`, `hasOpenSession`, `calculateExpectedAmount`, `openSession`, `closeSession`, `reopenSession`.
- `convex/safe.ts` — `approveFundRequest` : garde-fou « une seule caisse ouverte ».
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-13 | 0.1 | Création de la story | Claude Opus 4.8 |
| 2026-06-13 | 1.0 | Implémentation complète (8 tâches), build/lint/codegen OK, statut → review | Claude Opus 4.8 |
