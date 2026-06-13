# Story 1.5 : Assistant IA (DeepSeek) pour l'administrateur

Status: review

<!-- Story issue d'une demande directe utilisateur. Décisions validées :
     - Assistant à la demande (chat admin) d'abord ; surveillance proactive = story ultérieure.
     - Fournisseur DeepSeek (API compatible OpenAI, function calling).
     - Données complètes (noms/téléphones clients autorisés). Admin uniquement. LECTURE SEULE.
     Recherche API + inventaire des queries menés via workflow (cf. brief). -->

## Story

En tant qu'**administrateur**,
je veux **poser des questions en langage naturel sur l'activité de ma boutique à un assistant IA qui lit mes données réelles**,
afin d'**obtenir des synthèses, repérer des problèmes et recevoir des recommandations sans fouiller les écrans.**

### Principe (ancrage par outils)

L'IA ne reçoit pas « toute la base ». Elle dispose d'une **boîte à outils en LECTURE SEULE** (des queries Convex). À chaque question, le modèle choisit les outils, l'**action serveur** exécute les queries (en contexte admin), renvoie les **vrais chiffres**, et l'IA répond ancrée dans ces données. Cela évite les hallucinations et respecte le contrôle d'accès.

### Décisions techniques (issues de la recherche)

- **Appel 100 % serveur** : une **action Convex** lit `process.env.DEEPSEEK_API_KEY`. La clé ne touche JAMAIS le navigateur.
- **Modèle configurable** : `process.env.DEEPSEEK_MODEL ?? "deepseek-chat"`. `deepseek-chat` fonctionne aujourd'hui ; il sera déprécié (~2026-07-24) au profit de `deepseek-v4-flash` → on garde le nom en variable d'env pour migrer sans redéployer. **Ne jamais coder le modèle en dur.**
- **Endpoint** : `POST https://api.deepseek.com/chat/completions`, en-tête `Authorization: Bearer <clé>`, `Content-Type: application/json`. Compatible OpenAI.
- **Function calling** : param `tools` (type `function`, JSON Schema), `tool_choice: "auto"`. La réponse a `finish_reason: "tool_calls"` et `message.tool_calls[]` ; **`function.arguments` est une CHAÎNE JSON** → `JSON.parse` dans un try/catch + validation. Renvoyer chaque résultat via un message `{ role: "tool", tool_call_id, content }`, puis relancer.
- **Boucle d'orchestration** : max **6 itérations** (garde anti-boucle) ; au dernier tour `tool_choice: "none"` pour forcer une réponse texte. Tronquer chaque résultat d'outil (agrégats, listes limitées) pour maîtriser les tokens.
- **Contexte admin** : l'action vérifie `role === "admin"` puis exécute les outils via `ctx.runQuery` ; l'identité Clerk se propage, donc les queries role-gated renvoient les données complètes. (Abidjan = UTC+0 → « aujourd'hui » est correct.)
- **Erreurs DeepSeek** : 401 (clé), 402 (solde épuisé), 429 (concurrence → backoff), 500/503 (réessayer). Message clair à l'admin si indisponible. Pas de bascule de secours.
- **Mode thinking** : ne JAMAIS renvoyer `reasoning_content` dans l'historique (→ 400). On ne le persiste pas.

## Acceptance Criteria

1. **Action serveur sécurisée** — `assistant.ask({ conversationId?, message })` est une **action Convex** réservée à l'**admin** (vérification du rôle ; refus explicite sinon). Elle lit la clé via `process.env.DEEPSEEK_API_KEY` (jamais exposée au client) et le modèle via `process.env.DEEPSEEK_MODEL` (défaut `deepseek-chat`).
2. **Boucle de function calling** — L'action envoie la question + l'historique + le registre d'outils à DeepSeek ; tant que la réponse demande des outils, elle parse les arguments (try/catch + validation), exécute la query mappée, renvoie le résultat (`role: "tool"`) et relance ; plafond **6 itérations** ; dernier tour `tool_choice: "none"`. Aucun outil n'écrit (lecture seule stricte — aucune mutation exposée).
3. **Registre d'outils (lecture seule)** — Au moins ces outils sont exposés : `get_business_dashboard`, `get_sales_summary`, `get_top_products`, `get_receivables`, `get_low_stock`, `get_cash_discrepancy_report`, `get_expenses_summary`, `get_audit_logs`, `search_clients`, `get_client_detail`. Chacun mappe une query Convex (existante ou créée en Task 3) exécutée en contexte admin.
4. **Persistance & conversations** — Conversations et messages sont stockés (`assistantConversations`, `assistantMessages`) ; les messages `user`/`assistant`/`tool` sont conservés pour rejouer l'historique (sans `reasoning_content`). Une query admin renvoie la liste des conversations et les messages d'une conversation (filtrés par propriétaire).
5. **Garde-fous de réponse** — Prompt système strict : français, FCFA (entiers, séparateur de milliers), **ne répondre QUE depuis les données des outils**, « Je ne sais pas, cette information n'est pas disponible dans les données. » sinon, lecture seule (renvoie vers l'écran concerné si on demande une action), réponses concises (1–4 phrases / courte liste).
6. **UI chat admin** — Une page « Assistant IA » (admin uniquement) : liste de conversations, fil de messages (réactif via Convex), zone de saisie, état « en train de réfléchir », suggestions de questions, badge « lecture seule ». Gestion lisible des erreurs (402 solde, 429 trop de requêtes, 503 indisponible). Entrée dans la Sidebar (admin).
7. **Robustesse & non-régression** — `JSON.parse` des arguments protégé ; résultats d'outils tronqués ; retry/backoff sur 429/500/503 ; aucune mutation ajoutée ; le reste de l'app inchangé. Build TypeScript + lint OK. (Test live impossible sans clé : voir Dev Notes.)

## Tasks / Subtasks

- [x] **Task 1 — Schéma** (AC: 4) — [`convex/schema.ts`](../../convex/schema.ts)
  - [x] `assistantConversations` : `userId` (string), `title` (optional string), `createdAt` (number), `updatedAt` (number), `lastMessageAt` (optional number), `messageCount` (optional number), `model` (optional string), `archived` (optional boolean). Index `by_user_updated` (["userId","updatedAt"]), `by_user` (["userId"]).
  - [x] `assistantMessages` : `conversationId` (id), `userId` (string), `role` (union user|assistant|tool|system), `content` (string), `toolCalls` (optional string JSON), `toolCallId` (optional string), `toolName` (optional string), `createdAt` (number), `tokensPrompt`/`tokensCompletion`/`latencyMs` (optional number), `errorCode` (optional string). Index `by_conversation` (["conversationId","createdAt"]), `by_user` (["userId"]).

- [x] **Task 2 — Queries conversation (admin, propriétaire)** (AC: 4, 6) — `convex/assistant.ts` (nouveau, partie queries/mutations)
  - [x] `getConversations()` : conversations de l'admin courant (par `by_user_updated` desc). Admin only.
  - [x] `getMessages({ conversationId })` : messages d'une conversation appartenant à l'admin (rôles `user`/`assistant` affichables ; les messages `tool` peuvent être masqués côté UI). Admin only.
  - [x] internalMutations : `createConversation`, `addMessage`, `touchConversation` (appelées par l'action).

- [x] **Task 3 — Queries d'agrégation (outils manquants)** (AC: 3) — `convex/sales.ts`, `stock.ts`, `cashSessions.ts`, `expenses.ts`, `clients.ts`
  - [x] `sales.getSalesSummaryByPeriod(startDate,endDate,productId?)` → `{ totalAmount, totalQuantity, salesCount, byMethod:{cash,mobile_money,credit:{amount,count}}, byDay:[{date,amount,count}] }`. Admin/manager. Bornes inclusives → timestamps (00:00 → 23:59:59 locaux).
  - [x] `sales.getTopProductsBySales(startDate,endDate,limit=10)` → `[{productId,name,quantity,amount}]` trié par montant desc. limit borné à 50.
  - [x] `sales.getSalesByClient(clientId,startDate?,endDate?)` → `{ totalAmount, purchaseCount, totalQuantity, paidAmount, creditAmount, outstandingAmount, byProduct:[...] }`.
  - [x] `cashSessions.getCashDiscrepancyReport(startDate?,endDate?,userId?)` → `{ totalDiscrepancy, sessionsWithDiscrepancyCount, totalSessions, byCashier:[...], sessions:[...] }` (sessions clôturées avec écart). Admin/manager.
  - [x] `expenses.getExpensesSummaryByPeriod(startDate?,endDate?,category?,status?)` → `{ total, count, byCategory:[...], byStatus:[...] }`. Admin/manager.
  - [x] `assistant`-friendly dashboard : `getBusinessDashboard(date?)` (dans `convex/assistant.ts` ou `sales.ts`) composant les lectures existantes (jour, caisse attendue des sessions ouvertes, solde coffre, créances, stock bas, en-attente). Admin/manager.
  - [x] Réutiliser tels quels : `clients.getReceivables`, `stock.getStockStats`, `audit.getAuditLogs`, `clients.searchClients`, `clients.getClient` + `clients.getClientLedger`.
  - [x] **Hors scope** : marge (nécessite `products.costPrice` inexistant) → NE PAS exposer d'outil marge.

- [x] **Task 4 — Action + registre d'outils + DeepSeek** (AC: 1, 2, 3, 5, 7) — `convex/assistant.ts` (action)
  - [x] Constante `SYSTEM_PROMPT` (cf. Dev Notes). Registre `TOOLS` : tableau `{ name, description, parameters (JSON Schema), run: (ctx, args) => Promise<unknown> }` ; `run` exécute la query mappée via `ctx.runQuery(...)` et renvoie un résultat **tronqué**.
  - [x] `ask` action : auth + `role === "admin"` (sinon throw). Créer/charger la conversation ; persister le message `user` (via internalMutation). Construire `messages` (system + historique + user). Boucle ≤ 6 : `fetch` DeepSeek (`model`, `messages`, `tools`, `tool_choice`), gérer erreurs HTTP (401/402/429/500/503 → message clair, backoff sur 429/500/503). Si `tool_calls` : pour chacun `JSON.parse(arguments)` (try/catch → message d'erreur outil), valider le nom d'outil, exécuter `run`, persister + ajouter messages assistant(tool_calls) & tool. Sinon : persister la réponse `assistant`, sortir. Dernier tour `tool_choice: "none"`.
  - [x] Ne jamais renvoyer `reasoning_content` dans l'historique. Tronquer les résultats d'outils. Enregistrer `tokens*`/`latencyMs`/`errorCode` si dispo.

- [x] **Task 5 — UI page Assistant** (AC: 6) — `src/pages/AssistantPage.tsx` (nouveau) + Sidebar + DashboardLayout + App routing
  - [x] Page chat admin : colonne conversations (liste + « Nouvelle »), fil de messages réactif (`getMessages`), zone de saisie qui appelle l'action `ask` (via `useAction`), spinner « réflexion… », suggestions de questions, badge « Lecture seule ». Erreurs (402/429/503) affichées clairement.
  - [x] Ajouter la page `'assistant'` au type `Page` (Sidebar), à `DashboardLayout` (titre/description), au routing d'`App.tsx`/pages index, **visible admin uniquement**.

- [x] **Task 6 — Vérification** (AC: 7)
  - [x] `npx convex codegen` ; `npm run build` ; `npx eslint` sur les fichiers modifiés → 0 erreur.
  - [x] Configurer la clé (cf. Setup) puis dérouler le plan de test manuel.

## Dev Notes

### Setup de la clé DeepSeek (à faire par l'utilisateur)

1. Créer un compte sur https://platform.deepseek.com.
2. **Recharger le solde prépayé** (Billing / Top up) — sans crédit, l'API renvoie `402 Insufficient Balance`.
3. https://platform.deepseek.com/api_keys → « Create API key » → **copier la clé immédiatement** (affichée une seule fois).
4. Côté Convex (jamais en `VITE_*`) : `npx convex env set DEEPSEEK_API_KEY sk-xxxx` (et `--prod` pour la prod).
5. (Optionnel, recommandé) `npx convex env set DEEPSEEK_MODEL deepseek-v4-flash` pour migrer du modèle déprécié sans redéploiement. Vérifier : `npx convex env list`.

### Prompt système (esquisse stricte)

> Tu es l'assistant de gestion de LOCAGRI (point de vente agricole). Tu réponds à l'ADMINISTRATEUR, en français, de façon concise et factuelle. RÈGLE ABSOLUE : tu ne réponds QUE sur la base des données renvoyées par tes outils ; tu n'inventes jamais un chiffre, un nom, un solde ni une date. Si aucun outil ne fournit l'info : « Je ne sais pas, cette information n'est pas disponible dans les données. ». Pour toute question chiffrée, appelle l'outil pertinent et cite la période. FCFA, entiers, séparateur de milliers. Convertis « ce mois / hier / la semaine dernière » en bornes YYYY-MM-DD (date du jour fournie). Pour un client cité par son nom : `search_clients` puis `get_client_detail`. Pour « fais le point » : `get_business_dashboard`. Accès LECTURE SEULE : tu ne modifies/valides/supprimes rien ; si on le demande, indique l'écran à utiliser. Réponds en 1–4 phrases ou courte liste, chiffre clé en premier.

### Architecture & pièges

- **Actions Convex & `fetch`** : le runtime Convex par défaut fournit `fetch` (pas besoin de `"use node"`). Les actions ne peuvent pas écrire en base directement → persister via `ctx.runMutation(internal.assistant.addMessage, …)` et lire via `ctx.runQuery(...)`.
- **Propagation d'auth** : `ctx.runQuery` depuis l'action conserve l'identité Clerk de l'appelant → les queries role-gated voient l'admin. Vérifier quand même `role === "admin"` au début de l'action.
- **`tool_calls` parallèles** : la réponse peut contenir plusieurs appels → tous les exécuter et renvoyer un message `tool` par `tool_call_id`.
- **Validation des arguments** : `function.arguments` est une chaîne ; `JSON.parse` en try/catch ; champs hors schéma possibles → ignorer/valider ; renvoyer une erreur d'outil lisible plutôt que crasher.
- **Troncature** : les queries `getSalesHistory`/`getExpensesHistory` font des `collect()` complets ; pour les outils, **agréger côté query** et limiter les listes (ex. top 50) avant de renvoyer au modèle (coût/contexte).
- **Sécurité** : aucune mutation dans le registre d'outils. La page et les queries sont admin only. La clé reste serveur.

### Hors périmètre (stories ultérieures)

- Surveillance **proactive** (cron quotidien + alertes WhatsApp/SMS) — story suivante (réutilisera ces outils).
- **Marge brute** (nécessite `products.costPrice`).
- **Streaming** de la réponse token par token (v1 : réponse complète persistée, UI réactive).
- Mode **anonymisé** (toggle PII) — décision actuelle = données complètes.
- Actions d'écriture pilotées par l'IA (rester lecture seule).

### Project Structure Notes

- Backend : `convex/schema.ts`, **`convex/assistant.ts`** (nouveau : action + queries + internalMutations + registre d'outils + appel DeepSeek), agrégations dans `sales.ts`/`cashSessions.ts`/`expenses.ts`.
- Front : **`src/pages/AssistantPage.tsx`** (nouveau), `src/components/layout/Sidebar.tsx` (entrée admin), `DashboardLayout.tsx` (titre), `App.tsx` + `src/pages/index.ts` (routing).
- Réutilise : `clients.getReceivables/searchClients/getClient/getClientLedger`, `stock.getStockStats`, `audit.getAuditLogs`.

### Tests (build + plan manuel — clé requise pour le live)

1. `npm run build` + `npx eslint` (fichiers modifiés) → 0 erreur. `npx convex codegen` OK. (Le code compile sans clé ; l'exécution nécessite `DEEPSEEK_API_KEY`.)
2. Sans clé : l'action doit renvoyer une erreur claire (« Assistant non configuré : clé DeepSeek manquante »).
3. Avec clé : « Fais-moi le point de la journée » → appelle `get_business_dashboard`, répond avec CA/caisse/créances/stock. « Qui me doit le plus ? » → `get_receivables`. « Ventes du mois dernier ? » → `get_sales_summary` sur les bonnes bornes. « Combien Jean Dupont a acheté ? » → `search_clients` puis `get_client_detail`.
4. **Garde-fou** : question hors données (« quel temps fera-t-il ? ») → « Je ne sais pas… ». Demande d'action (« approuve la dépense X ») → refus lecture seule + renvoi vers l'écran.
5. **Accès** : un compte manager/caissier appelant `ask`/`getConversations` est refusé.
6. **Erreurs** : solde épuisé → message 402 lisible.

### References

- Brief de conception (workflow recherche) : API DeepSeek (endpoint, tool-calling, modèles, erreurs) + inventaire des queries + registre d'outils.
- [Source: convex/clients.ts] `getReceivables`, `searchClients`, `getClient`, `getClientLedger` (réutilisés).
- [Source: convex/stock.ts] `getStockStats` (réutilisé). [Source: convex/audit.ts] `getAuditLogs` (réutilisé).
- [Source: convex/sales.ts#L64] `getTodayStats` (modèle d'agrégation pour `getSalesSummaryByPeriod`).
- [Source: convex/cashSessions.ts] `getSessionHistory` (source du rapport d'écarts).

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story. Recherche API DeepSeek + inventaire des queries via workflow multi-agents.

### Debug Log References

- `npx convex codegen` (tables assistant + nouvelles queries) ; `npx tsc -p convex/tsconfig.json` exit 0 ; `npm run build` (`tsc -b && vite build`) → 0 erreur ; `npx eslint` (8 fichiers) exit 0.
- **Correctif `process`** : sous la config TS du front (qui typecheck `assistant.ts` via les types générés importés par l'UI), `process` n'est pas typé. Accès remplacé par `(globalThis as { process?: { env?: Record<string,string|undefined> } }).process?.env` — portable build front/back, fonctionne au runtime Convex.

### Completion Notes List

- **AC1** : action `assistant.ask` admin only (vérifie `getCurrentUser().role === "admin"`), lit `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL` (défaut `deepseek-chat`) côté serveur. Erreur claire si clé absente.
- **AC2** : boucle function calling (max 6 itérations, dernier tour `tool_choice:"none"`), `JSON.parse` des arguments en try/catch, retry/backoff sur 429/500/503, messages 401/402 lisibles. Aucune mutation exposée.
- **AC3** : 10 outils lecture seule (`get_business_dashboard`, `get_sales_summary`, `get_top_products`, `get_receivables`, `get_low_stock`, `get_cash_discrepancy_report`, `get_expenses_summary`, `get_audit_logs`, `search_clients`, `get_client_detail`) → queries Convex exécutées en contexte admin (auth propagée via `ctx.runQuery`). Résultats tronqués (12k).
- **AC4** : tables `assistantConversations`/`assistantMessages` ; persistance via internalMutations ; queries admin `getConversations`/`getMessages` (filtrées propriétaire, messages `tool` masqués à l'UI) ; `reasoning_content` jamais persisté.
- **AC5** : `SYSTEM_PROMPT` strict (FR, FCFA, données-seulement, « Je ne sais pas… », lecture seule, concis) + date du jour injectée.
- **AC6** : [`AssistantPage.tsx`](../../src/pages/AssistantPage.tsx) (chat réactif, conversations, suggestions, badge « Lecture seule », « Analyse des données… », erreurs via toast) ; entrée Sidebar admin (`Sparkles`), routing `App.tsx` + `DashboardLayout` + `pages/index.ts`.
- **AC7** : build + lint OK ; troncature des résultats ; aucune mutation ; reste de l'app inchangé. **6 nouvelles queries d'agrégation** dans `convex/analytics.ts` (admin/manager).
- ⚠️ **Non testé en live** (pas de clé DeepSeek ici) : validation build/types/lint + revue. Avant prod : `npx convex env set DEEPSEEK_API_KEY sk-...` (+ optionnel `DEEPSEEK_MODEL deepseek-v4-flash`), puis dérouler le plan de test.

### File List

- `convex/schema.ts` — tables `assistantConversations` + `assistantMessages`.
- `convex/analytics.ts` (nouveau) — `getSalesSummaryByPeriod`, `getTopProductsBySales`, `getSalesByClient`, `getCashDiscrepancyReport`, `getExpensesSummaryByPeriod`, `getBusinessDashboard`.
- `convex/assistant.ts` (nouveau) — action `ask`, registre de 10 outils, appel DeepSeek, internalMutations + internalQuery de persistance, queries admin `getConversations`/`getMessages`.
- `src/pages/AssistantPage.tsx` (nouveau) ; `src/pages/index.ts` ; `src/App.tsx` ; `src/components/layout/Sidebar.tsx` ; `src/components/layout/DashboardLayout.tsx`.
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-13 | 0.1 | Création de la story (recherche API DeepSeek + brief via workflow) | Claude Opus 4.8 |
| 2026-06-13 | 1.0 | Implémentation complète (6 tâches), build/lint/codegen OK, statut → review | Claude Opus 4.8 |
