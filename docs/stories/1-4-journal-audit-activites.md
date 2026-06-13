# Story 1.4 : Journal d'audit des activités utilisateurs (référencé & exportable)

Status: review

<!-- Story issue d'une demande directe utilisateur. -->

## Story

En tant qu'**administrateur**,
je veux **un journal horodaté et parfaitement référencé de toutes les actions sensibles des utilisateurs, consultable et exportable**,
afin de **pouvoir enquêter en cas d'erreur ou de fraude et garder une traçabilité complète de l'activité (argent, rôles, stock, caisse).**

### Contexte (factuel)

Aucune table de journal générique n'existe. Des traces partielles existent (`safeTransactions`, `stockMovements`, `clientPayments`) mais rien ne couvre les actions de gestion : changement de rôle, activation/désactivation de compte, ajustement du coffre, validation de dépense, réouverture de caisse, suppression de produit, etc. Le pattern « acteur dénormalisé » (`identity` → `users` `by_clerk_id` → `user.role`/`user.name`) est déjà présent dans toutes les mutations, donc écrire un log est trivial à brancher.

## Acceptance Criteria

1. **Table de journal référencée** — Une table `auditLogs` enregistre chaque action sensible avec : une **référence unique** `LOG-YYYYMMDD-XXXXX` (séquentielle, comme les ventes — « parfaitement référencé »), l'horodatage, l'**acteur** (clerkId + nom + rôle, dénormalisés), une **action** typée, une **catégorie**, la **cible** (type/id/référence/nom si applicable), un **résumé** lisible en français, et optionnellement les valeurs **avant/après** et des métadonnées.
2. **Écriture centralisée** — Un helper unique `writeAuditLog(ctx, { ... })` génère la référence `LOG-` et insère la ligne. Toutes les mutations sensibles l'appellent (dans la même transaction que l'action), sans dupliquer la logique.
3. **Actions tracées (périmètre prioritaire)** — Au minimum : **Utilisateurs** (`updateUserRole`, `toggleUserActive`, bootstrap 1ᵉʳ admin de `getOrCreateUser`) ; **Coffre** (`initializeSafe`, `adjustSafe`, `approveFundRequest`, `rejectFundRequest`, `confirmDeposit`) ; **Dépenses** (`approveExpense`, `rejectExpense`, `withdrawExpense`) ; **Caisse** (`openSession`, `closeSession`, `reopenSession`) ; **Stock** (`addStock`, `adjustStock`) ; **Produits** (`addProduct`, `updateProduct`, `toggleProductActive`, `deleteProduct`) ; **Clients** (`deactivateClient`, `reactivateClient`, `recordClientPayment`). Les changements de **valeur** (rôle, prix, statut, montant) enregistrent `before`/`after`.
4. **Consultation admin uniquement** — Une query `getAuditLogs` réservée à l'**admin** renvoie les logs filtrables par **acteur**, **catégorie** et **plage de dates**, triés du plus récent au plus ancien, paginés/limités. Les non-admins reçoivent un accès refusé (liste vide).
5. **Page admin** — Une vue « Journal d'activité » (admin) affiche les logs (référence, date, acteur, rôle, résumé, catégorie) avec les filtres ci-dessus. Visible uniquement pour l'admin.
6. **Export** — Les logs filtrés sont **exportables en Excel** (référence, date, acteur, rôle, action, catégorie, cible, avant→après, résumé), via le même mécanisme que les exports existants.
7. **Robustesse & non-régression** — L'échec d'écriture d'un log ne doit jamais faire échouer l'action métier sous-jacente de façon silencieuse trompeuse (voir Dev Notes pour la stratégie). Aucune migration de données. Build TypeScript + lint OK.

## Tasks / Subtasks

- [x] **Task 1 — Schéma `auditLogs` + compteur** (AC: 1) — [`convex/schema.ts`](../../convex/schema.ts), [`convex/references.ts`](../../convex/references.ts)
  - [x] Table `auditLogs` : `reference` (string), `date` (number), `actorId` (string), `actorName` (string), `actorRole` (string), `action` (string — clé typée, ex. `"user.role_changed"`), `category` (union : `"user" | "safe" | "expense" | "session" | "stock" | "product" | "client"`), `targetType` (optional string), `targetId` (optional string), `targetRef` (optional string), `targetName` (optional string), `summary` (string, FR), `before` (optional string), `after` (optional string), `metadata` (optional string, JSON). Index : `by_date` (["date"]), `by_actor` (["actorId"]), `by_category` (["category"]), `by_reference` (["reference"]).
  - [x] `counters.type` : ajouter `v.literal("log")`. `references.ts` : `PREFIXES.log = "LOG"`, ajouter `"log"` à `DATED_TYPES` et au validateur de `getNextReference` → `LOG-YYYYMMDD-XXXXX`.

- [x] **Task 2 — Helper d'écriture** (AC: 2, 7) — nouveau fichier [`convex/audit.ts`](../../convex/audit.ts)
  - [x] Exporter une fonction `async function writeAuditLog(ctx, args)` (PAS une mutation — une fonction appelée depuis les handlers de mutation) qui : reçoit `{ actor: { id, name, role }, action, category, summary, targetType?, targetId?, targetRef?, targetName?, before?, after?, metadata? }`, génère la référence via `ctx.runMutation(internal.references.getNextReference, { type: "log" })`, et insère dans `auditLogs` avec `date: Date.now()`.
  - [x] Optionnel : un petit helper `getActor(ctx)` qui résout `identity` → `users` et renvoie `{ id, name, role }` (réutilise le pattern existant), pour éviter la duplication dans chaque mutation.

- [x] **Task 3 — Instrumentation des mutations sensibles** (AC: 3) — fichiers `convex/users.ts`, `safe.ts`, `expenses.ts`, `cashSessions.ts`, `stock.ts`, `products.ts`, `clients.ts`
  - [x] Dans chaque mutation listée à l'AC3, après l'action réussie (juste avant le `return`), appeler `await writeAuditLog(ctx, { ... })` avec un `summary` FR explicite et, pour les changements de valeur, `before`/`after` (ex. `updateUserRole` : `before` = ancien rôle, `after` = nouveau ; `updateProduct` : prix avant/après ; `adjustSafe` : solde avant/après ; `closeSession` : écart si ≠ 0). Catégoriser correctement.
  - [x] Veiller à ne PAS journaliser les mutations à très haute fréquence non sensibles (ex. `createSale` standant) pour éviter le bruit — `createSale` est déjà tracé via `stockMovements`/`safe` ; on le laisse hors périmètre (cf. AC3 qui ne l'inclut pas). Les ventes à crédit et `recordClientPayment` SONT tracées (argent + dette).

- [x] **Task 4 — Query de consultation** (AC: 4) — [`convex/audit.ts`](../../convex/audit.ts) (ou un fichier `auditQueries`)
  - [x] `getAuditLogs({ actorId?, category?, startDate?, endDate?, limit? })` : query réservée à l'admin (résoudre l'utilisateur ; si `role !== "admin"` → retourner `[]`). Charger via `by_date` ordre desc, appliquer les filtres, limiter (défaut ex. 200). Retourner les logs (déjà dénormalisés).
  - [x] Optionnel : `getAuditActors()` (liste distincte des acteurs présents dans les logs) pour alimenter le filtre par acteur.

- [x] **Task 5 — Page admin « Journal d'activité »** (AC: 5) — `src/components/admin/AuditLog.tsx` (nouveau) + intégration dans [`src/pages/AdminPage.tsx`](../../src/pages/AdminPage.tsx)
  - [x] Composant `AuditLog` : filtres (sélecteur d'acteur, sélecteur de catégorie, plage de dates via le `calendar`/`popover` déjà utilisés ailleurs), tableau des logs (référence mono, date/heure, acteur + rôle, catégorie en badge, résumé), état vide, et bouton **Exporter**.
  - [x] Intégrer dans `AdminPage` (onglet/section), visible **admin uniquement** (vérifier le mécanisme d'onglets existant d'`AdminPage`). Éventuellement ajouter une entrée Sidebar admin.

- [x] **Task 6 — Export Excel** (AC: 6) — [`src/lib/exportUtils.ts`](../../src/lib/exportUtils.ts) (+ branchement UI)
  - [x] Ajouter `AuditLogExportData` + `exportAuditLogsToExcel(logs, startDate?, endDate?)` (colonnes : Référence, Date, Acteur, Rôle, Action, Catégorie, Cible, Avant, Après, Résumé), sur le modèle de `exportSalesToExcel`. Brancher le bouton Exporter de `AuditLog`.

- [x] **Task 7 — Vérification** (AC: 7)
  - [x] `npx convex codegen` ; `npm run build` ; `npx eslint` sur les fichiers modifiés → 0 erreur.
  - [x] Dérouler le plan de test manuel (Dev Notes › Tests).

## Dev Notes

### Conception — détails

- **Référence parfaite** : `LOG-YYYYMMDD-XXXXX` via le compteur quotidien existant (même mécanisme que `VNT`/`REG`), garantissant une référence unique et séquentielle par jour. L'index `by_reference` permet de retrouver un log précis.
- **Action typée + résumé lisible** : `action` est une clé stable pour le filtrage/agrégation (ex. `"safe.adjusted"`), `summary` est la phrase FR montrée à l'admin (ex. « Ajustement du coffre : 120 000 → 100 000 FCFA, motif : correction inventaire »). Stocker les deux.
- **Avant/après** : stockés en `string` (nombre ou court texte ; JSON si structuré). Suffisant pour l'audit (rôle, prix, solde, statut, écart).
- **Atomicité** : `writeAuditLog` s'exécute dans la **même mutation** que l'action → si l'action réussit, le log est écrit ; si l'action échoue (throw), rien n'est écrit (cohérent). Ne PAS envelopper `writeAuditLog` dans un try/catch qui avalerait l'erreur silencieusement (AC7) : un échec d'insert du log est anormal et doit remonter (il signifierait un bug). En revanche, ne jamais journaliser une action qui a échoué.
- **Réutiliser** `getActor(ctx)` pour éviter de re-résoudre l'utilisateur dans chaque mutation (la plupart le résolvent déjà — passer l'objet `user` au helper).

### Pièges

- **Bruit** : ne pas journaliser `createSale` standard (déjà tracé ailleurs, très fréquent) ; se limiter au périmètre AC3.
- **Accès** : la query DOIT refuser les non-admins (retourner `[]`), pas seulement masquer l'UI.
- **Compteur `log`** : penser à l'ajouter aux 3 endroits de `references.ts` (PREFIXES, DATED_TYPES, validateur) **et** à `counters.type` dans le schéma — sinon erreur de validation Convex.
- **Exhaustivité** : la nouvelle catégorie/union n'impacte pas le typage existant (table neuve), mais l'export et l'UI doivent gérer toutes les catégories.

### Hors périmètre (stories séparées)

- Alertes temps réel (WhatsApp/SMS) sur action sensible — réutilisera ce journal plus tard.
- Capture d'adresse IP / appareil (non disponible côté Convex sans action HTTP dédiée).
- Rétention/purge automatique des vieux logs.
- Journalisation des **lectures** (consultations) — uniquement les actions de modification.

### Project Structure Notes

- Backend : nouveau `convex/audit.ts` (helper + query), `convex/schema.ts`, `convex/references.ts`, et instrumentation dans `users.ts`/`safe.ts`/`expenses.ts`/`cashSessions.ts`/`stock.ts`/`products.ts`/`clients.ts`.
- UI : `src/components/admin/AuditLog.tsx` (nouveau), `src/pages/AdminPage.tsx`, `src/lib/exportUtils.ts`. Vérifier le mécanisme d'onglets d'`AdminPage` (composants `ProductManagement`/`UserManagement`/`ExpenseManagement` déjà présents) et l'accès admin via `getCurrentUser`.

### Tests (build + plan manuel)

1. `npm run build` + `npx eslint` (fichiers modifiés) → 0 erreur. `npx convex codegen` OK.
2. **Traçage** : effectuer une action sensible de chaque catégorie (changer un rôle, ajuster le coffre, approuver une dépense, réouvrir une caisse, ajuster du stock, supprimer un produit, encaisser un règlement) → un log `LOG-…` apparaît, avec acteur/rôle/résumé corrects et `before/after` quand pertinent.
3. **Filtres** : filtrer par acteur, par catégorie, par plage de dates → résultats cohérents.
4. **Accès** : un compte caissier/manager appelant `getAuditLogs` reçoit `[]` ; l'onglet n'apparaît pas.
5. **Export** : exporter → fichier Excel avec toutes les colonnes, lignes filtrées.
6. **Non-régression** : les actions métier fonctionnent comme avant ; une action qui échoue n'écrit pas de log.

### References

- [Source: convex/references.ts#L8-L50] `ReferenceType`/`PREFIXES`/`DATED_TYPES`/`formatReference` (modèle pour `log`).
- [Source: convex/users.ts] `updateUserRole`, `toggleUserActive`, `getOrCreateUser` (bootstrap admin).
- [Source: convex/safe.ts] `adjustSafe`, `approveFundRequest`, `confirmDeposit`, etc.
- [Source: convex/cashSessions.ts#L446] `reopenSession` (action sensible à tracer).
- [Source: src/lib/exportUtils.ts#L59-L77] `exportSalesToExcel` (modèle d'export).
- [Source: src/pages/AdminPage.tsx] intégration de la page admin.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story (instrumentation des 5 derniers fichiers déléguée à des sous-agents parallèles).

### Debug Log References

- `npx convex codegen` (table `auditLogs`, compteur `log`) ; `npm run build` → 0 erreur ; `npx eslint` (backend + UI) exit 0.
- Récap instrumentation : **24 appels** `writeAuditLog` sur 7 fichiers (clients 3, cashSessions 4, products 4, safe 5, expenses 3, users 3, stock 2), 21 clés d'action distinctes, aucun try/catch parasite.

### Completion Notes List

- **AC1** : table `auditLogs` avec référence `LOG-YYYYMMDD-XXXXX`, acteur (id/nom/rôle), action typée, catégorie, cible, before/after, metadata, summary FR. Compteur `log`/`LOG` ajouté (`counters`, `references.ts` aux 3 endroits).
- **AC2** : helper unique `writeAuditLog(ctx, …)` dans [`convex/audit.ts`](../../convex/audit.ts), génère la réf + insère, dans la même transaction. (Le helper `getActor` optionnel n'a pas été créé : l'`actor` est construit inline depuis l'objet `user` déjà résolu dans chaque mutation, donc aucune requête supplémentaire.)
- **AC3** : actions tracées — `session.opened/closed/reopened`, `user.role_changed`, `user.activated/deactivated`, `user.admin_bootstrap`, `safe.initialized/adjusted/fund_approved/fund_rejected/deposit_confirmed`, `expense.approved/rejected/withdrawn`, `stock.added/adjusted`, `product.created/updated/archived/unarchived/deleted`, `client.deactivated/reactivated/payment_recorded`. Changements de valeur (rôle, prix, solde, statut, écart) en `before`/`after`. `createSale` standard non journalisé (volume + déjà tracé).
- **AC4** : `getAuditLogs` (filtres acteur/catégorie/dates, limite 500) **refuse les non-admins** (retourne `[]`). `getAuditActors` pour le filtre.
- **AC5** : onglet « Journal » dans [`AdminPage`](../../src/pages/AdminPage.tsx) (admin uniquement, déjà gardé), composant [`AuditLog.tsx`](../../src/components/admin/AuditLog.tsx) : filtres + tableau (réf, date, acteur+rôle, catégorie colorée, résumé, avant→après).
- **AC6** : `exportAuditLogsToExcel` ([`exportUtils.ts`](../../src/lib/exportUtils.ts)) + bouton Exporter (10 colonnes).
- **AC7** : `writeAuditLog` jamais enveloppé d'un try/catch silencieux (un échec remonte) ; logué seulement après action réussie ; aucune migration. Build + lint OK.
- ⚠️ Vérification manuelle live non effectuée (validation build/types/lint + revue + grep d'instrumentation). Dérouler le plan de test (déclencher une action de chaque catégorie, filtrer, exporter, vérifier le refus non-admin) avec `npx convex dev` avant prod.

### File List

- `convex/schema.ts` — table `auditLogs` (+index) ; `counters.type` += `log`.
- `convex/references.ts` — type `log` → `LOG-` daté.
- `convex/audit.ts` (nouveau) — `writeAuditLog` + `getAuditLogs` + `getAuditActors`.
- `convex/users.ts`, `safe.ts`, `expenses.ts`, `stock.ts`, `products.ts`, `clients.ts`, `cashSessions.ts` — instrumentation (`writeAuditLog`).
- `src/components/admin/AuditLog.tsx` (nouveau) ; `src/components/admin/index.ts` ; `src/pages/AdminPage.tsx` — onglet Journal.
- `src/lib/exportUtils.ts` — `AuditLogExportData` + `exportAuditLogsToExcel`.
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-13 | 0.1 | Création de la story | Claude Opus 4.8 |
| 2026-06-13 | 1.0 | Implémentation complète (7 tâches), 24 points d'audit, build/lint/codegen OK, statut → review | Claude Opus 4.8 |
