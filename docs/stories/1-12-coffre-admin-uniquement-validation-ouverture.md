# Story 1.12 : Coffre réservé à l'admin + validation admin obligatoire pour ouvrir une caisse

Status: review

<!-- Demande directe utilisateur (pas d'epics.md dans ce projet). Suite des stories 1.10 / 1.11.
     Domaine : Caisse / Coffre (epic 1). Numéro suivant : 1-12. -->

## Story

En tant que **propriétaire / administrateur de LOCAGRI**,
je veux **que seul l'admin ait accès au coffre et valide les fonds de caisse, et que toute ouverture de caisse (y compris la mienne) passe par une validation explicite**,
afin que **personne ne se serve seul dans le coffre : chaque sortie d'argent pour un fond est tracée et validée par l'administrateur (séparation des responsabilités).**

### Contexte métier (le « pourquoi » exact)

Trois règles demandées par l'utilisateur :

1. **Seul l'admin valide.** Le manager **ne peut plus** approuver une demande de fond ni confirmer un versement.
2. **Le manager n'a aucun accès au coffre.** Plus d'entrée « Coffre » dans son menu, ni d'accès à la page / aux données du coffre.
3. **Même l'admin doit valider sa propre ouverture.** Plus d'ouverture directe « silencieuse » : l'admin passe par une demande de fond qu'il **valide lui-même** (ce qui débite le coffre et laisse une trace d'approbation).

> Citation utilisateur : « Uniquement les admin peuvent valider. D'ailleurs, le manager n'a pas accès au coffre. Et même quand c'est un admin, il faut une validation par lui-même. »

### Ce qui se passait avant

- `isPrivilegedUser = admin || manager` ([CashSessionProvider](../../src/components/cash/CashSessionProvider.tsx)) → **admin ET manager ouvraient leur caisse directement** via `openSession`, sans demande de fond ni approbation.
- Le coffre (`safe.ts`, `SafeManagement`, entrée « Coffre » du menu) était accessible **admin OU manager**, et `approveFundRequest`/`rejectFundRequest`/`confirmDeposit` étaient autorisés au manager.

### Le modèle cible (un seul chemin validé)

| Rôle | Ouvrir une caisse (coffre actif) | Accès / validation coffre |
|------|----------------------------------|---------------------------|
| **Caissier** | Demande de fond → **admin** approuve → coffre débité | ❌ aucun |
| **Manager** | Demande de fond → **admin** approuve → coffre débité | ❌ aucun (plus de menu Coffre) |
| **Admin** | Demande de fond → **valide sa propre demande** → coffre débité | ✅ seul à valider/accéder |

`approveFundRequest` est désormais l'**unique** voie d'ouverture quand un coffre existe (elle débite le coffre, comme posé par la story [1.10](1-10-coffre-debit-fond-ouverture-caisse.md)). `openSession` (ouverture directe) est **réservé aux déploiements sans coffre**.

## Acceptance Criteria

1. **Coffre = admin uniquement (serveur)** — Toutes les fonctions de [`convex/safe.ts`](../../convex/safe.ts) réservées « admin ou manager » deviennent **admin seulement** : `getSafeStatus`, `getTransactionHistory`, `getPendingFundRequests(+Count)`, `getPendingDeposits(+Count)`, `approveFundRequest`, `rejectFundRequest`, `confirmDeposit`. Un manager reçoit `[]` / `null` (queries) ou une erreur « Seuls les administrateurs… » (mutations).
2. **Coffre = admin uniquement (UI)** — La page [`SafeManagement`](../../src/components/safe/SafeManagement.tsx) n'est accessible qu'à l'admin (sinon « Accès réservé aux administrateurs »), et l'entrée **« Coffre »** du menu ([`Sidebar`](../../src/components/layout/Sidebar.tsx)) n'apparaît que pour l'admin.
3. **Ouverture toujours validée (coffre actif)** — Quand un coffre est initialisé, **tous les rôles** (caissier, manager, admin) passent par le workflow de demande de fond ([`CashSessionProvider`](../../src/components/cash/CashSessionProvider.tsx)) ; aucune ouverture directe. L'admin valide sa propre demande sur la page Coffre (accessible sans session ouverte).
4. **Garde serveur de l'ouverture directe** — `openSession` ([`convex/cashSessions.ts`](../../convex/cashSessions.ts)) **refuse** d'ouvrir quand un coffre existe (`throw`) : l'ouverture passe alors obligatoirement par `approveFundRequest`. `openSession` reste utilisable **uniquement** sans coffre (et n'y touche pas au coffre).
5. **Aucune régression** — `npm run build` (`tsc -b`) passe ; aucune nouvelle erreur de lint. Le débit du coffre à l'ouverture reste assuré par `approveFundRequest` (story 1.10). Les stories 1.10 / 1.11, le flux caissier et la clôture/versement restent cohérents. Aucun changement de schéma.

## Tasks / Subtasks

- [x] **Task 1 — Coffre réservé à l'admin (serveur)** (AC: 1) — [`convex/safe.ts`](../../convex/safe.ts)
  - [x] Les 9 contrôles `(role !== "admin" && role !== "manager")` deviennent `role !== "admin"` (queries + `approveFundRequest`/`rejectFundRequest`/`confirmDeposit`).
  - [x] Messages d'erreur mis à jour (« Seuls les administrateurs peuvent approuver / rejeter / confirmer un versement »).
- [x] **Task 2 — Coffre réservé à l'admin (UI)** (AC: 2) — [`SafeManagement.tsx`](../../src/components/safe/SafeManagement.tsx), [`Sidebar.tsx`](../../src/components/layout/Sidebar.tsx)
  - [x] `SafeManagement` : garde d'accès `role !== 'admin'` + message « Accès réservé aux administrateurs ».
  - [x] `Sidebar` : `canAccessSafe = userRole === 'admin'` (l'entrée « Coffre » disparaît pour le manager).
- [x] **Task 3 — Ouverture toujours validée par l'admin** (AC: 3, 4) — [`CashSessionProvider.tsx`](../../src/components/cash/CashSessionProvider.tsx), [`convex/cashSessions.ts`](../../convex/cashSessions.ts)
  - [x] Provider : `showFundRequestWorkflow` ne dépend plus de `!isPrivilegedUser` → tous les rôles passent par la demande de fond quand le coffre est actif. `OpenSessionModal` n'est plus rendu que sans coffre.
  - [x] `openSession` : **garde serveur** — `if (safe) throw` ; suppression du débit direct de la story 1.10 devenu superflu (le débit se fait via `approveFundRequest`). Retour simplifié (sans `newSafeBalance`).
  - [x] `OpenSessionModal` : nettoyé (retrait de la logique coffre de la 1.10, désormais inerte puisque ce modal ne s'affiche que sans coffre).
- [x] **Task 4 — Vérification** (AC: 5)
  - [x] `npm run build` → 0 erreur ; `eslint` sur les fichiers modifiés → aucune **nouvelle** erreur (1 avertissement `react-refresh` **préexistant** dans `CashSessionProvider`, hors périmètre).

## Dev Notes

### Conception (un seul chemin d'ouverture quand le coffre existe)

- **`approveFundRequest` = voie unique** : crée la session du demandeur **et** débite le coffre (transaction `withdrawal`). Toute ouverture coffre-actif y passe désormais — caissier, manager et admin.
- **Auto-validation admin** : l'admin sans caisse voit l'écran « Demander un fond » (la page Coffre, elle, n'exige pas de session — [`SafePage`](../../src/pages/SafePage.tsx) ne wrappe pas `CashSessionProvider`), va sur le Coffre, approuve sa propre demande → session créée + coffre débité. C'est la « validation par lui-même ».
- **`openSession` réservé au sans-coffre** : garde serveur `if (safe) throw`. Sur un déploiement sans coffre, comportement inchangé (création de session, pas de coffre à débiter).
- **`isPrivilegedUser`** reste utilisé pour `canBypassSession` (consultation du tableau de bord sans caisse) — non modifié : il ne s'agit pas d'un accès au coffre.

### Hors périmètre

- Refonte de l'UX d'auto-validation admin en une seule action (combiner demande + approbation) : la réutilisation du flux existant (demande → approbation) suffit ; une action combinée serait une amélioration séparée.
- Le wording de `CashierFundRequest` (« …à un responsable ») reste générique : fonctionnel pour l'admin, ajustement cosmétique éventuel plus tard.
- Avertissement lint `react-refresh/only-export-components` dans `CashSessionProvider` (hook `useCashSession` exporté avec le composant) : **préexistant**, non traité ici.

### References

- [Source: convex/safe.ts] 9 gardes de rôle → admin uniquement ; messages d'erreur.
- [Source: convex/cashSessions.ts#openSession] Garde serveur `if (safe) throw` ; retrait du débit 1.10.
- [Source: src/components/cash/CashSessionProvider.tsx] `showFundRequestWorkflow` sans `!isPrivilegedUser`.
- [Source: src/components/layout/Sidebar.tsx] `canAccessSafe = admin`.
- [Source: src/components/safe/SafeManagement.tsx] Garde d'accès admin.
- [Source: convex/safe.ts#approveFundRequest] Voie unique de débit du coffre (story 1.10).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context).

### Debug Log References

- `npm run build` (`tsc -b && vite build`) → **0 erreur** (avertissement de taille de chunk préexistant).
- `eslint` sur les 6 fichiers modifiés → aucune **nouvelle** erreur ; 1 avertissement `react-refresh` préexistant dans `CashSessionProvider` (confirmé présent sur la version d'origine).

### Completion Notes List

- **AC1/AC2** : coffre (données + page + menu) restreint à l'admin ; le manager perd tout accès et toute capacité de validation.
- **AC3/AC4** : tous les rôles passent par la demande de fond validée par l'admin quand le coffre est actif ; `openSession` bloqué côté serveur si un coffre existe → l'ouverture directe est impossible à contourner.
- **Débit du coffre** : toujours assuré (via `approveFundRequest`, story 1.10) ; le débit direct ajouté dans `openSession` par la 1.10 est retiré car redondant et hors du chemin validé.
- ⚠️ **Vérification live non réalisée ici** (déploiement Convex non configuré) : validée par build + lint + revue logique. Dérouler dans l'app : (a) manager → plus de menu Coffre, ne peut pas approuver ; (b) admin sans caisse → demande de fond → auto-approbation sur la page Coffre → caisse ouverte + coffre débité ; (c) sans coffre → ouverture directe inchangée.

### File List

- `convex/safe.ts` — 9 gardes de rôle → admin uniquement ; 3 messages d'erreur mis à jour ; commentaire `getSafeStatus`.
- `convex/cashSessions.ts` — `openSession` : garde serveur `if (safe) throw` ; retrait du débit coffre de la 1.10 ; retour simplifié.
- `src/components/cash/CashSessionProvider.tsx` — `showFundRequestWorkflow` applicable à tous les rôles ; commentaires.
- `src/components/cash/OpenSessionModal.tsx` — nettoyage de la logique coffre de la 1.10 (désormais sans-coffre uniquement).
- `src/components/safe/SafeManagement.tsx` — garde d'accès admin + message.
- `src/components/layout/Sidebar.tsx` — `canAccessSafe = admin`.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-16 | 1.0 | Coffre réservé à l'admin ; manager sans accès coffre ni validation ; ouverture toujours validée par l'admin (`openSession` bloqué si coffre actif). Build + lint OK, statut → review | Claude Opus 4.8 |
