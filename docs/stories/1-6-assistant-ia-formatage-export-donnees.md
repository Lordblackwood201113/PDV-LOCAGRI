# Story 1.6 : Assistant IA — données complètes, formatage, exports PDF/Excel & gestion des conversations

Status: review

<!-- Story issue d'une demande directe utilisateur :
     « Améliore le chatbot IA : accès à TOUTES les données de l'application,
       textes en gras/italique, génération de PDF et de fichiers Excel,
       et possibilité d'effacer une conversation. »
     C'est une ÉVOLUTION de la story 1.5 (assistant DeepSeek déjà livré, statut review).
     On NE refait PAS la story 1.5 : on étend l'existant.
     Décisions reprises de 1.5, inchangées : admin uniquement, LECTURE SEULE,
     clé DeepSeek 100 % serveur, appel via action Convex, données complètes (PII autorisée). -->

## Story

En tant qu'**administrateur**,
je veux **un assistant IA qui voit l'intégralité des données de la boutique, met en forme ses réponses (gras, italique, listes, tableaux), peut générer à la demande des rapports PDF et Excel, et me laisse effacer une conversation**,
afin de **consulter, comprendre et partager mes données plus efficacement, sans quitter le chat.**

### Ce qui existe déjà (story 1.5 — NE PAS reconstruire)

- Action `assistant.ask` (admin only, lecture seule, DeepSeek function calling, boucle ≤ 6 itérations) — [`convex/assistant.ts`](../../convex/assistant.ts).
- **Registre de 10 outils** lecture seule (`get_business_dashboard`, `get_sales_summary`, `get_top_products`, `get_receivables`, `get_low_stock`, `get_cash_discrepancy_report`, `get_expenses_summary`, `get_audit_logs`, `search_clients`, `get_client_detail`) — [`convex/assistant.ts:75`](../../convex/assistant.ts#L75).
- Tables `assistantConversations` / `assistantMessages` + queries `getConversations` / `getMessages` + internalMutations de persistance — [`convex/assistant.ts:343`](../../convex/assistant.ts#L343), [`convex/schema.ts:355`](../../convex/schema.ts#L355).
- Page chat admin réactive — [`src/pages/AssistantPage.tsx`](../../src/pages/AssistantPage.tsx).
- Agrégations partagées — [`convex/analytics.ts`](../../convex/analytics.ts).
- **Excel déjà disponible** : `xlsx` est dans `package.json` + helpers client `exportSalesToExcel` / `exportStockMovementsToExcel` / `exportAuditLogsToExcel` — [`src/lib/exportUtils.ts`](../../src/lib/exportUtils.ts). Pattern d'export = **client-side** (`XLSX.writeFile` déclenche le téléchargement navigateur), cf. [`ExportReportsModal.tsx`](../../src/components/reports/ExportReportsModal.tsx).

### Ce qui manque (le périmètre de CETTE story)

1. **Couverture de données partielle** : aucun outil n'expose le **coffre** (`safe` / `safeTransactions`), le **détail ligne à ligne** des ventes (`getSalesHistory`), des dépenses (`getExpensesHistory`), des **sessions de caisse** (`getSessionHistory`), le **catalogue produits** (`getAllProducts`), l'**équipe** (`listUsers`) ni les **opérations en attente** (demandes de fond, versements, dépenses). → élargir le registre.
2. **Réponses en texte brut** : les bulles assistant affichent `{m.content}` avec `whitespace-pre-wrap` — [`src/pages/AssistantPage.tsx:164`](../../src/pages/AssistantPage.tsx#L164). Aucun rendu Markdown (pas de gras/italique/listes/tableaux). Aucune lib Markdown installée.
3. **Aucune génération PDF** : aucune lib PDF dans `package.json` (`jspdf` absent). L'IA ne peut pas produire de fichier.
4. **Pas de suppression** : ni mutation `deleteConversation`, ni bouton UI.

### Principes (inchangés depuis 1.5)

- **Admin uniquement, LECTURE SEULE.** Aucune mutation d'écriture n'est exposée à l'IA. La seule mutation ajoutée (`deleteConversation`) agit **uniquement** sur les conversations de l'assistant appartenant à l'admin courant — jamais sur les données métier.
- **Clé DeepSeek 100 % serveur** (`process.env.DEEPSEEK_API_KEY`), modèle via `process.env.DEEPSEEK_MODEL` (défaut `deepseek-chat`). Jamais en `VITE_*`.
- **Ancrage par outils** : l'IA répond à partir des résultats d'outils, pas de sa mémoire. Les nouveaux outils restent des **queries Convex** exécutées en contexte admin (auth propagée par `ctx.runQuery`).
- **Génération de fichiers = client-side** (cohérent avec l'existant). L'IA **prépare** un export (valide les paramètres, compte les lignes) ; le **navigateur récupère le jeu de données complet** via la query admin correspondante puis fabrique le fichier (xlsx déjà présent, jspdf à ajouter). La clé et les données restent maîtrisées ; on évite de faire « recracher » un gros tableau au modèle (hallucinations + coût de tokens).

## Acceptance Criteria

1. **Couverture totale des données (registre élargi)** — Le registre d'outils expose, en plus des 10 existants, au minimum : `get_safe_status` (solde coffre), `get_safe_transactions` (mouvements du coffre : initial/retrait/dépôt/ajustement/versement bancaire), `list_products` (catalogue : prix, stock, seuil), `get_sales_detail` (ventes ligne à ligne sur période), `get_stock_movements` (mouvements de stock), `get_expenses_detail` (dépenses détaillées), `get_cash_sessions` (sessions de caisse), `list_team` (utilisateurs/rôles/actifs), `get_pending_operations` (demandes de fond + versements + dépenses en attente). Chacun mappe une **query existante** exécutée en contexte admin ; résultats **tronqués** comme les autres (cap `MAX_TOOL_RESULT_CHARS`). Aucun outil n'écrit.
2. **Formatage Markdown des réponses** — Le `SYSTEM_PROMPT` autorise et encourage un Markdown léger (**gras** `**…**`, *italique* `*…*`, listes `-`, tableaux GFM) tout en restant concis. Les bulles **assistant** sont rendues en Markdown (gras/italique/listes/tableaux GFM lisibles) ; les bulles **utilisateur** restent en texte brut. Le rendu **n'autorise pas le HTML brut** (pas d'injection). Les anciens messages en texte brut continuent de s'afficher correctement.
3. **L'IA prépare des exports PDF & Excel** — Un outil `prepare_export({ report, format, startDate?, endDate?, … })` permet au modèle de préparer un rapport. `report` couvre au moins : `sales`, `stock_movements`, `receivables`, `expenses`, `audit_logs`, `cash_sessions`, `safe_transactions`. `format ∈ { pdf, xlsx }`. L'outil **valide** les paramètres, exécute la query sous-jacente pour **confirmer qu'il y a des données et compter les lignes**, et renvoie au modèle un résumé court (`{ ok, report, format, rowCount, period }`) — **sans** réinjecter tout le jeu de données. L'export préparé est **attaché au message assistant final** (champ `exports` JSON) et persisté.
4. **Téléchargement client-side du fichier** — Dans la page Assistant, tout message assistant porteur d'un (ou plusieurs) `exports` affiche un **bouton de téléchargement** par export (« 📄 PDF » / « 📊 Excel »). Au clic, l'UI récupère le **jeu de données complet** via la query admin correspondante (fetch impératif `useConvex().query(...)`), puis fabrique le fichier **côté navigateur** : Excel via `xlsx` (réutilise/étend `exportUtils.ts`), PDF via `jspdf` + `jspdf-autotable` (nouveau `src/lib/pdfUtils.ts`, en-tête LOCAGRI, période, totaux). Conversion des bornes de dates au format attendu par chaque query (certaines en ms `number`, d'autres en `"AAAA-MM-JJ"`). Si 0 ligne, message clair, pas de fichier vide.
5. **Effacer une conversation** — Mutation `deleteConversation({ conversationId })` : **admin + propriétaire** uniquement ; **supprime en cascade** tous les `assistantMessages` de la conversation puis la conversation. Dans la Sidebar des conversations, chaque entrée a une **action Supprimer** (icône corbeille) avec **confirmation**. Si la conversation supprimée est celle ouverte, l'UI revient à l'état « nouvelle conversation » (`conversationId = null`).
6. **Sécurité & garde-fous (inchangés + nouveaux)** — `ask`, tous les nouveaux outils, `prepare_export` et `deleteConversation` sont **admin only** ; `deleteConversation` vérifie en plus la **propriété** (`conv.userId === identity.subject`). Aucune mutation métier ajoutée/exposée à l'IA. Le prompt rappelle la **lecture seule** : pour générer un fichier l'IA utilise `prepare_export` (pas d'invention de chiffres) ; pour toute action métier, elle renvoie vers l'écran concerné. Rendu Markdown sans HTML brut.
7. **Robustesse & non-régression** — `JSON.parse` des arguments d'outils protégé ; résultats tronqués ; retry/backoff DeepSeek conservés ; la boucle ≤ 6 itérations et le dernier tour `tool_choice: "none"` restent valides avec le registre élargi. Les conversations/messages existants restent lisibles. `npx convex codegen` + `npm run build` (`tsc -b && vite build`) + `npx eslint` (fichiers modifiés) → **0 erreur**. (Test live DeepSeek : nécessite `DEEPSEEK_API_KEY`, cf. Dev Notes.)

## Tasks / Subtasks

- [x] **Task 1 — Schéma : attacher des exports aux messages** (AC: 3) — [`convex/schema.ts`](../../convex/schema.ts)
  - [x] Ajouter `exports: v.optional(v.string())` à la table `assistantMessages` (chaîne JSON : tableau de descripteurs `{ report, format, title, rowCount, params }`). Champ optionnel → rétro-compatible avec les messages existants. Pas de nouvel index nécessaire.
  - [x] `npx convex codegen` pour régénérer les types.

- [x] **Task 2 — Élargir le registre d'outils (lecture seule)** (AC: 1, 6) — [`convex/assistant.ts`](../../convex/assistant.ts) (constante `TOOLS`)
  - [x] `get_safe_status` → `ctx.runQuery(api.safe.getSafeStatus, {})`.
  - [x] `get_safe_transactions` → `api.safe.getTransactionHistory` (`{ limit?, type? }`, `type ∈ initial|withdrawal|deposit|adjustment|bank_deposit`). Borner `limit`.
  - [x] `list_products` → `api.products.getAllProducts` (catalogue complet : prix, stock, seuil, actif).
  - [x] `get_sales_detail` → `api.sales.getSalesHistory` (`{ startDate?, endDate?, productId?, clientId?, limit? }` — **bornes en ms** : convertir `AAAA-MM-JJ` → timestamp comme le fait déjà `toMs`/`startTs`).
  - [x] `get_stock_movements` → `api.stock.getStockHistory` (`{ startDate?, endDate?, type?, productId?, limit? }`, dates en ms).
  - [x] `get_expenses_detail` → `api.expenses.getExpensesHistory` (`{ startDate?, endDate?, status?, limit? }` — **dates en `AAAA-MM-JJ` string**).
  - [x] `get_cash_sessions` → `api.cashSessions.getSessionHistory` (`{ startDate?, endDate?, userId?, limit? }`, dates en `AAAA-MM-JJ`).
  - [x] `list_team` → `api.users.listUsers` (admin only côté query ; l'action est déjà admin).
  - [x] `get_pending_operations` → composer `api.safe.getPendingFundRequests` + `api.safe.getPendingDeposits` + `api.expenses.getPendingExpenses` (Promise.all) et renvoyer un objet agrégé tronqué.
  - [x] Mettre à jour le `SYSTEM_PROMPT` : citer brièvement les nouveaux domaines disponibles (coffre, détail ventes/dépenses, sessions, produits, équipe, en-attente) pour aider la sélection d'outils. **Ne pas coder le modèle en dur.**
  - [x] Vérifier que chaque `run` tronque via le helper existant et reste **lecture seule**.

- [x] **Task 3 — Outil `prepare_export` + collecte sur le message final** (AC: 3, 6) — [`convex/assistant.ts`](../../convex/assistant.ts)
  - [x] Définir un type `ExportDescriptor = { report: string; format: 'pdf'|'xlsx'; title: string; rowCount: number; params: Record<string, unknown> }`.
  - [x] Outil `prepare_export` : paramètres `report` (enum : `sales`, `stock_movements`, `receivables`, `expenses`, `audit_logs`, `cash_sessions`, `safe_transactions`), `format` (`pdf`|`xlsx`), `startDate?`, `endDate?`, filtres optionnels. `run` : exécute la query sous-jacente pour **compter** les lignes (réutilise les queries de détail), construit un `title` lisible (ex. « Ventes du 01/05 au 31/05 »), renvoie `{ ok: rowCount>0, report, format, rowCount, period }`. **Ne renvoie pas** le dataset complet au modèle.
  - [x] Dans l'action `ask` : maintenir `const preparedExports: ExportDescriptor[] = []`. Lors de l'exécution des `tool_calls`, **cas spécial** `prepare_export` : après `run`, si `ok`, pousser le descripteur dans `preparedExports` (en plus de renvoyer le résumé court au modèle via le message `tool`).
  - [x] Au moment de persister le **message assistant final**, si `preparedExports.length > 0`, écrire `exports: JSON.stringify(preparedExports)` (via `addMessage` — ajouter l'argument optionnel `exports` à l'internalMutation et au validateur).
  - [x] `getMessages` doit **renvoyer le champ `exports`** (déjà inclus si on ne projette pas — vérifier que le filtre `user|assistant` conserve l'objet complet).

- [x] **Task 4 — Mutation de suppression de conversation** (AC: 5, 6) — [`convex/assistant.ts`](../../convex/assistant.ts)
  - [x] `deleteConversation` (`mutation`, args `{ conversationId }`) : `requireAdmin` ; charger la conversation ; vérifier `conv.userId === auth.identity.subject` (sinon throw « Conversation introuvable »). Supprimer **tous** les `assistantMessages` via l'index `by_conversation` (`collect()` puis `ctx.db.delete` en boucle), puis `ctx.db.delete(conversationId)`.
  - [x] (Optionnel, non requis) `clearMessages` pour vider sans supprimer — **hors scope**, ne pas implémenter sauf demande.

- [x] **Task 5 — Rendu Markdown des réponses** (AC: 2) — [`src/pages/AssistantPage.tsx`](../../src/pages/AssistantPage.tsx)
  - [x] Ajouter les dépendances `react-markdown` + `remark-gfm` (`npm i react-markdown remark-gfm`). **Pas** de `rehype-raw` (HTML brut interdit).
  - [x] Créer un petit composant `MarkdownMessage` (dans `AssistantPage.tsx` ou `src/components/assistant/MarkdownMessage.tsx`) : `<ReactMarkdown remarkPlugins={[remarkGfm]} components={{…}}>`. Mapper les éléments (`strong`, `em`, `ul/ol/li`, `table/thead/tbody/tr/th/td`, `p`, `code`) avec des classes Tailwind lisibles (le plugin `@tailwindcss/typography` n'est **pas** installé → styliser via `components` ou quelques classes utilitaires ; tableaux : bordures fines, padding compact, scroll horizontal si large).
  - [x] Dans le rendu des messages, n'utiliser `MarkdownMessage` que pour `m.role === 'assistant'`. Les bulles `user` gardent `whitespace-pre-wrap` + `{m.content}`.
  - [x] Conserver la couleur de texte des bulles (assistant = gris foncé). Vérifier que le gras/italique/listes/tableaux s'affichent et que le scroll bas (`scrollRef`) fonctionne toujours.

- [x] **Task 6 — Génération de fichiers côté client (Excel + PDF)** (AC: 4) — [`src/lib/exportUtils.ts`](../../src/lib/exportUtils.ts) + `src/lib/pdfUtils.ts` (nouveau)
  - [x] Ajouter les dépendances `jspdf` + `jspdf-autotable` (`npm i jspdf jspdf-autotable`).
  - [x] `src/lib/pdfUtils.ts` (nouveau) : helper générique `exportTableToPdf({ title, period?, columns, rows, totals? })` → `jsPDF` + `autoTable`, en-tête « LOCAGRI » + titre + période, ligne(s) de total, `doc.save(filename)`. Montants formatés FCFA (réutiliser `formatExportPrice`).
  - [x] `exportUtils.ts` : factoriser/ajouter un `exportRowsToExcel({ sheetName, columns, rows, filename })` générique réutilisable par tous les rapports (les helpers spécifiques existants restent).
  - [x] Mapper chaque `report` → (query admin, colonnes, mise en forme) dans un module partagé (ex. `src/lib/assistantExports.ts`) :
    - `sales` → `api.sales.getSalesHistory` (réutilise la forme de `exportSalesToExcel`).
    - `stock_movements` → `api.stock.getStockHistory`.
    - `receivables` → `api.clients.getReceivables`.
    - `expenses` → `api.expenses.getExpensesHistory`.
    - `audit_logs` → `api.audit.getAuditLogs`.
    - `cash_sessions` → `api.cashSessions.getSessionHistory`.
    - `safe_transactions` → `api.safe.getTransactionHistory`.
  - [x] **Conversion des dates** par rapport (piège) : `getSalesHistory`/`getStockHistory` attendent des **ms** ; `getExpensesHistory`/`getSessionHistory` attendent des **strings `AAAA-MM-JJ`** ; gérer la conversion dans le mapping.

- [x] **Task 7 — UI : boutons d'export + suppression de conversation** (AC: 4, 5) — [`src/pages/AssistantPage.tsx`](../../src/pages/AssistantPage.tsx)
  - [x] Import `useConvex` (`convex/react`) pour les fetchs impératifs au clic.
  - [x] Sous chaque bulle assistant ayant `m.exports` (parser le JSON), afficher un bouton par export (libellé : titre + « PDF »/« Excel »). Au clic : `setBusy`, `convex.query(...)` pour récupérer le jeu complet, appeler le générateur (`pdfUtils`/`exportUtils`) via le mapping `assistantExports`, toast succès/erreur, gérer 0 ligne.
  - [x] Sidebar conversations : sur chaque entrée, bouton **corbeille** (apparait au survol). Au clic → confirmation (Dialog `@/components/ui/dialog` déjà dispo, ou `window.confirm` minimal) → `useMutation(api.assistant.deleteConversation)`. Si l'`_id` supprimé == `conversationId` courant → `setConversationId(null)`. Toast.
  - [x] (Optionnel) badge « contient des exports » discret — non requis.

- [x] **Task 8 — Vérification** (AC: 7)
  - [x] `npx convex codegen` ; `npm run build` ; `npx eslint` sur les fichiers modifiés → 0 erreur.
  - [x] Dérouler le plan de test manuel (Dev Notes) une fois `DEEPSEEK_API_KEY` configurée.

## Dev Notes

### Architecture du flux d'export (le point clé)

> Le modèle ne doit JAMAIS « réécrire » le jeu de données dans sa réponse (hallucinations + coût). Séparer **préparer** (serveur, valide + compte) et **télécharger** (client, fetch complet + fabrication du fichier).

```
1. L'admin : « exporte les ventes de mai en Excel »
2. DeepSeek appelle prepare_export({ report:'sales', format:'xlsx', startDate:'2026-05-01', endDate:'2026-05-31' })
3. run() exécute getSalesHistory(bornes) → compte 142 → renvoie { ok:true, report, format, rowCount:142, period } (résumé court)
4. L'action pousse le descripteur dans preparedExports ; le modèle répond en texte (« J'ai préparé l'export des 142 ventes… »)
5. Le message assistant final est persisté avec exports = [ { report, format, title, rowCount, params } ]
6. L'UI affiche un bouton « 📊 Ventes mai 2026 — Excel »
7. Au clic : convex.query(api.sales.getSalesHistory, {startMs, endMs}) → 142 lignes complètes → exportRowsToExcel(...) → téléchargement
```

- **Pourquoi client-side ?** Cohérent avec l'existant ([`exportUtils.ts`](../../src/lib/exportUtils.ts) + [`ExportReportsModal.tsx`](../../src/components/reports/ExportReportsModal.tsx) utilisent déjà `XLSX.writeFile` dans le navigateur). Le serveur-side (action `"use node"` + Convex file storage + URL signée) est **hors scope** (plus lourd, pas justifié ici).
- **Double fetch assumé** : la query est exécutée une fois pour compter (serveur, dans `prepare_export`) et une fois pour fabriquer le fichier (client, au clic). Les volumes (rapports boutique) sont petits → acceptable, et garantit un fichier **exact** (jamais tronqué).

### Pièges concrets (lus dans le code)

- **Formats de date hétérogènes** (déjà signalé en Task 6) : `getSalesHistory`/`getStockHistory` filtrent sur `date` en **ms** ([`convex/sales.ts:220`](../../convex/sales.ts#L220), [`convex/stock.ts:20`](../../convex/stock.ts#L20)) ; `getExpensesHistory`/`getSessionHistory` comparent des **strings** ([`convex/expenses.ts:245`](../../convex/expenses.ts#L245), [`convex/cashSessions.ts:182`](../../convex/cashSessions.ts#L182)). Le helper `toMs` existe déjà côté assistant ([`convex/assistant.ts:66`](../../convex/assistant.ts#L66)) ; côté UI, convertir `AAAA-MM-JJ` → `new Date(s+'T00:00:00').getTime()` (début) / `T23:59:59.999` (fin).
- **`getMessages` filtre les rôles** mais conserve l'objet complet (`messages.filter(m => m.role === 'user' || m.role === 'assistant')` — [`convex/assistant.ts:432`](../../convex/assistant.ts#L432)). Le champ `exports` y sera donc présent. Ne pas re-projeter.
- **`prepare_export` est un cas spécial dans la boucle** : `executeTool` renvoie une chaîne au modèle, mais l'action doit AUSSI collecter le descripteur. Le plus simple : dans la boucle `for (const tc of toolCalls)`, après `executeTool`, si `tc.function.name === 'prepare_export'`, re-parser le résultat (ou faire exécuter la validation par une fonction dédiée qui renvoie `{ summaryForModel, descriptor }`) et pousser `descriptor` dans `preparedExports`.
- **`addMessage`** : ajouter l'argument optionnel `exports: v.optional(v.string())` au validateur de l'internalMutation ([`convex/assistant.ts:370`](../../convex/assistant.ts#L370)) — sinon Convex rejette l'argument.
- **`listUsers` throw** si non-admin ([`convex/users.ts:43`](../../convex/users.ts#L43)) : ok ici (l'action est admin), et `executeTool` capture toute exception → message d'erreur outil lisible.
- **`deleteConversation`** : supprimer d'abord les messages (index `by_conversation`) PUIS la conversation ; la suppression de la conversation seule laisserait des messages orphelins. La query `getMessages`/`getConversations` étant filtrée par propriétaire, l'UI se met à jour réactivement.
- **`process` non typé sous la config TS front** : conserver l'accès via `(globalThis as {...}).process?.env` comme dans l'existant ([`convex/assistant.ts:453`](../../convex/assistant.ts#L453)).

### Markdown — rendu sûr

- `react-markdown` n'interprète **pas** le HTML brut par défaut (pas de `rehype-raw`) → pas d'injection. Le contenu vient du modèle (faible risque), mais on garde la valeur par défaut sûre.
- Pas de `@tailwindcss/typography` dans le projet → styliser via le mapping `components` de `ReactMarkdown` (classes Tailwind sur `strong/em/ul/ol/li/table/...`). Tableaux GFM : conteneur `overflow-x-auto`, bordures `border` fines, cellules `px-2 py-1`.
- `SYSTEM_PROMPT` (extrait à ajouter) : « Tu peux structurer tes réponses en Markdown léger : **gras** pour les chiffres clés, listes à puces pour les énumérations, et tableaux Markdown pour comparer plusieurs lignes. Reste concis. »

### Nouvelles dépendances

| Paquet | Usage | Note |
|--------|-------|------|
| `react-markdown` | rendu Markdown des réponses | front, AC2 |
| `remark-gfm` | tableaux/listes GFM | front, AC2 |
| `jspdf` | génération PDF client | front, AC4 |
| `jspdf-autotable` | tableaux PDF | front, AC4 |
| `xlsx` | **déjà présent** | réutilisé, AC4 |

**Gotchas de version :**
- `jspdf-autotable` v3+ s'utilise en **import fonctionnel** : `import autoTable from 'jspdf-autotable'` puis `autoTable(doc, { head, body, ... })` — **pas** `doc.autoTable(...)` (ancienne API, types KO).
- `react-markdown` v9 est **ESM** et compatible React 19 ; importer `import ReactMarkdown from 'react-markdown'` et `import remarkGfm from 'remark-gfm'`. Vite gère l'ESM nativement.

### Sécurité & accès (récap)

- `ask`, nouveaux outils, `prepare_export`, `deleteConversation` : **admin only**. `deleteConversation` vérifie en plus la **propriété**.
- Les queries mappées sont déjà role-gated (admin/manager ou admin). L'auth Clerk se propage via `ctx.runQuery`.
- **Aucune** mutation métier exposée à l'IA. La seule mutation ajoutée touche exclusivement `assistantConversations`/`assistantMessages` de l'admin.

### Hors périmètre (stories ultérieures)

- Génération **serveur** des fichiers (Convex file storage + URL signée) — on reste client-side.
- **Streaming** token par token (réponse complète + UI réactive conservés).
- Surveillance **proactive** (cron + alertes) — réutilisera ces outils.
- **Marge brute** (nécessite `products.costPrice` inexistant) — toujours hors scope.
- Export d'**images/graphiques** (PNG/charts) dans le PDF — v1 = tableaux.
- Renommer/archiver une conversation — seule la **suppression** est demandée.

### Project Structure Notes

- **Backend** : [`convex/schema.ts`](../../convex/schema.ts) (champ `exports`), [`convex/assistant.ts`](../../convex/assistant.ts) (registre élargi + `prepare_export` + collecte + `deleteConversation` + `addMessage.exports`). Réutilise les queries existantes de `safe.ts`, `products.ts`, `sales.ts`, `stock.ts`, `expenses.ts`, `cashSessions.ts`, `users.ts`, `clients.ts`, `audit.ts`, `analytics.ts` — **aucune nouvelle query métier nécessaire** (sauf si on choisit d'ajouter une query composite `get_pending_operations`).
- **Front** : [`src/pages/AssistantPage.tsx`](../../src/pages/AssistantPage.tsx) (Markdown, boutons export, suppression), `src/lib/pdfUtils.ts` (nouveau), [`src/lib/exportUtils.ts`](../../src/lib/exportUtils.ts) (helper générique), `src/lib/assistantExports.ts` (nouveau : mapping report→query→fichier), éventuellement `src/components/assistant/MarkdownMessage.tsx`.
- **Pas de** changement de routing/Sidebar (la page « Assistant IA » existe déjà depuis 1.5).

### Tests (build + plan manuel — clé requise pour le live)

1. `npx convex codegen` + `npm run build` + `npx eslint` (fichiers modifiés) → 0 erreur.
2. **Données complètes** : « Quel est le solde du coffre et les 5 derniers mouvements ? » → `get_safe_status` + `get_safe_transactions`. « Montre les dépenses approuvées du mois » → `get_expenses_detail`. « Liste mon équipe » → `list_team`. « Qu'est-ce qui est en attente ? » → `get_pending_operations`.
3. **Formatage** : une réponse de synthèse contient du **gras** (chiffre clé), une liste à puces et/ou un tableau, correctement rendus dans la bulle.
4. **Export Excel** : « Exporte les ventes de mai en Excel » → bouton « Ventes … Excel » → téléchargement `.xlsx` avec les **vraies** lignes (vérifier le nombre et un total). « Exporte le journal d'audit en PDF » → `.pdf` lisible (en-tête, tableau, période).
5. **0 ligne** : export d'une période vide → message « aucune donnée », pas de fichier vide.
6. **Suppression** : corbeille sur une conversation → confirmation → disparaît de la liste ; si c'était l'ouverte, retour à l'écran d'accueil ; les messages sont bien supprimés en base.
7. **Garde-fous** : « approuve la dépense X » → refus lecture seule + renvoi à l'écran. Question hors données → « Je ne sais pas… ». Compte **manager/caissier** appelant `ask`/`deleteConversation`/`prepare_export` → refusé. Suppression d'une conversation d'un **autre** admin → refusée (propriété).

### References

- Story précédente (base) : [`docs/stories/1-5-assistant-ia-deepseek.md`](./1-5-assistant-ia-deepseek.md).
- [Source: convex/assistant.ts] action `ask`, `TOOLS`, `executeTool`, `addMessage`, `getMessages`, `requireAdmin`.
- [Source: convex/analytics.ts] agrégations réutilisées.
- [Source: src/lib/exportUtils.ts] pattern d'export Excel client-side (à généraliser).
- [Source: src/components/reports/ExportReportsModal.tsx] pattern « fetch full data puis writeFile ».
- [Source: convex/safe.ts#L12] `getSafeStatus` ; [Source: convex/safe.ts#L55] `getTransactionHistory` ; [Source: convex/safe.ts#L107] `getPendingFundRequests` ; [Source: convex/safe.ts#L166] `getPendingDeposits`.
- [Source: convex/sales.ts#L218] `getSalesHistory` (ms) ; [Source: convex/stock.ts#L13] `getStockHistory` (ms).
- [Source: convex/expenses.ts#L237] `getExpensesHistory` (string) ; [Source: convex/expenses.ts#L114] `getPendingExpenses` ; [Source: convex/cashSessions.ts#L179] `getSessionHistory` (string).
- [Source: convex/products.ts#L38] `getAllProducts` ; [Source: convex/users.ts#L30] `listUsers` ; [Source: convex/audit.ts#L90] `getAuditLogs`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story (implémentation) + revue adversariale multi-agents (5 lentilles : conformité AC, sécurité, exactitude du mapping d'export, intégrité de la boucle DeepSeek, régression) avec vérification.

### Debug Log References

- `npx convex codegen` → OK (table `assistantMessages.exports`).
- `npx tsc -p convex/tsconfig.json` → exit 0.
- `npm run build` (`tsc -b && vite build`) → exit 0 (avertissement non bloquant : bundle > 500 kB car jspdf/xlsx ; html2canvas/dompurify sont des chunks paresseux de jspdf, non chargés sauf usage).
- `npx eslint` (7 fichiers modifiés/créés) → exit 0.
- Dépendances ajoutées : `react-markdown@^10`, `remark-gfm@^4`, `jspdf@^4`, `jspdf-autotable@^5`.

### Completion Notes List

- **AC1** — Registre élargi de 10 → 19 outils lecture seule dans `convex/assistant.ts` (`get_safe_status`, `get_safe_transactions`, `list_products`, `get_sales_detail`, `get_stock_movements`, `get_expenses_detail`, `get_cash_sessions`, `list_team`, `get_pending_operations`). Chacun mappe une query existante (admin/manager), résultats tronqués au même cap. Aucun outil n'écrit.
- **AC2** — `MarkdownMessage` (react-markdown + remark-gfm, sans rehype-raw → pas de HTML brut). Bulles assistant rendues en Markdown ; bulles user en texte brut (`whitespace-pre-wrap`). `SYSTEM_PROMPT` enrichi (encourage gras/listes/tableaux). Anciens messages (texte) restent lisibles (texte = Markdown valide).
- **AC3** — Outil `prepare_export` : valide `report`/`format`, exécute `countReportRows` pour confirmer ≥ 1 ligne, renvoie un résumé court (`{ok,report,format,rowCount,title}`) au modèle sans réinjecter le dataset. Les descripteurs validés sont accumulés (`preparedExports`) et attachés au message assistant final (`exports` JSON).
- **AC4** — Téléchargement client-side : `runAssistantExport` (`src/lib/assistantExports.ts`) re-fetch les données complètes via `useConvex().query(...)`, convertit les dates au format attendu par chaque query (ms : sales/stock/audit ; string AAAA-MM-JJ : expenses/cash_sessions ; aucune : receivables/safe_transactions), puis génère Excel (`exportRowsToExcel`) ou PDF (`exportTableToPdf`, en-tête LOCAGRI + totaux). 0 ligne → toast « Aucune donnée », pas de fichier.
- **AC5** — Mutation `deleteConversation` (admin + propriété `conv.userId === identity.subject`), supprime messages puis conversation. UI : corbeille au survol + `window.confirm` ; reset `conversationId` si la conv ouverte est supprimée.
- **AC6** — `ask`/`getConversations`/`getMessages`/`deleteConversation` admin only ; `deleteConversation` vérifie la propriété ; aucune mutation métier exposée à l'IA (`deleteConversation` n'est pas dans le registre d'outils) ; rendu Markdown sans HTML brut ; clé DeepSeek serveur uniquement.
- **AC7** — `JSON.parse` des arguments et des `exports` protégés ; résultats d'outils tronqués ; retry/backoff + gestion 401/402/429/5xx conservés ; boucle ≤ 6 itérations + dernier tour `tool_choice:"none"` inchangés ; `getMessages` filtre toujours user/assistant ; helpers Excel existants et `ExportReportsModal` intacts. Build + lint + codegen OK.
- ⚠️ **Non testé en live** (pas de clé DeepSeek dans cet environnement) : validation = types/build/lint + revue adversariale. Avant prod : `npx convex env set DEEPSEEK_API_KEY sk-...` puis dérouler le plan de test manuel (section Tests).

#### Corrections issues de la revue adversariale (5 findings confirmés, 3 causes uniques)

- ✅ **[HIGH] Filtre période ignoré pour `safe_transactions`** — `getTransactionHistory` n'acceptait pas `startDate`/`endDate` : l'export de période exportait TOUTES les transactions avec un `rowCount` faux. Corrigé : ajout du filtrage par dates (ms) à `getTransactionHistory` (`convex/safe.ts`, filtre AVANT la limite), propagation dans `countReportRows` (serveur) et `runAssistantExport` (client) avec la **même convention** de bornes (00:00:00 / 23:59:59.999) → comptage et fichier cohérents. Outil `get_safe_transactions` également doté de `startDate`/`endDate`.
- ✅ **[HIGH] `JSON.parse(m.toolCalls)` non protégé** au rejeu de l'historique (`ask`) : un `toolCalls` corrompu aurait fait planter l'action. Corrigé : `try/catch` → rejeu sans `tool_calls` en cas d'échec (même posture défensive que `executeTool`/`parseExports`).
- ✅ **[MED] Dates `cash_sessions` brutes** (`AAAA-MM-JJ`) dans l'export, incohérentes avec les autres rapports. Corrigé : helper `formatDay` → `JJ/MM/AAAA`.

### File List

- `convex/schema.ts` — champ `exports` (optionnel) sur `assistantMessages`.
- `convex/assistant.ts` — 9 nouveaux outils, `prepare_export` + collecte `preparedExports`, `countReportRows`/`exportTitle`/`runPrepareExport`, `deleteConversation`, `addMessage.exports`, `SYSTEM_PROMPT` enrichi, helpers `toMsEnd`/`num`, `JSON.parse(toolCalls)` protégé.
- `convex/safe.ts` — `getTransactionHistory` : filtrage optionnel par `startDate`/`endDate` (ms).
- `src/lib/exportUtils.ts` — helper générique `exportRowsToExcel` + type `Cell`.
- `src/lib/pdfUtils.ts` (nouveau) — `exportTableToPdf` (jspdf + jspdf-autotable).
- `src/lib/assistantExports.ts` (nouveau) — mapping report→query→fichier (`runAssistantExport`).
- `src/components/assistant/MarkdownMessage.tsx` (nouveau) — rendu Markdown sûr.
- `src/pages/AssistantPage.tsx` — Markdown, boutons d'export, suppression de conversation.
- `package.json` / `package-lock.json` — dépendances `react-markdown`, `remark-gfm`, `jspdf`, `jspdf-autotable`.
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-14 | 0.1 | Création de la story (évolution de 1.5 : données complètes, Markdown, exports PDF/Excel, suppression) | Claude Opus 4.8 |
| 2026-06-14 | 1.0 | Implémentation complète (8 tâches), build/lint/codegen OK, revue adversariale multi-agents | Claude Opus 4.8 |
| 2026-06-14 | 1.1 | Corrections revue : filtre période `safe_transactions`, `JSON.parse(toolCalls)` protégé, format date `cash_sessions` ; re-build/lint OK ; statut → review | Claude Opus 4.8 |
