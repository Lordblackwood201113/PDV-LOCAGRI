# Story 1.7 : Assistant IA — intelligence clients (nouveaux clients, recommandations, relances)

Status: review

<!-- Story issue d'une demande directe utilisateur :
     « Je veux que l'IA ait accès aux nouveaux clients du PDV afin d'aider à faire
       des recommandations, des relances… etc. »
     C'est une ÉVOLUTION des stories 1.5 (assistant DeepSeek) et 1.6 (données complètes,
     Markdown, exports PDF/Excel). On NE refait PAS 1.5/1.6 : on ÉTEND le registre d'outils
     LECTURE SEULE avec une « intelligence clients » (lister/segmenter les clients) et on
     branche ces listes sur le pipeline d'export existant.
     Décisions reprises de 1.5/1.6, inchangées : admin uniquement, LECTURE SEULE,
     clé DeepSeek 100 % serveur, ancrage par outils, exports client-side, PII autorisée. -->

## Story

En tant qu'**administrateur**,
je veux **que l'assistant IA accède à une « intelligence clients » — nouveaux clients d'une période, clients inactifs, meilleurs clients, débiteurs à relancer par ancienneté de la dette**,
afin qu'**il m'aide à formuler des recommandations commerciales et à préparer mes relances (accueil des nouveaux, crédit en retard, clients à réactiver), tout en restant en lecture seule.**

### Ce qui existe déjà (stories 1.5 + 1.6 — NE PAS reconstruire)

- Action `assistant.ask` (admin only, lecture seule, DeepSeek function calling, boucle ≤ 6 itérations) — [`convex/assistant.ts`](../../convex/assistant.ts).
- **Registre de 19 outils** lecture seule, dont **3 outils clients** : `search_clients`, `get_client_detail`, `get_receivables` — [`convex/assistant.ts:94`](../../convex/assistant.ts#L94), [`convex/assistant.ts:245`](../../convex/assistant.ts#L245), [`convex/assistant.ts:257`](../../convex/assistant.ts#L257).
- **Pipeline d'export** (story 1.6) : outil `prepare_export` + descripteurs attachés au message + téléchargement client-side (PDF/Excel) via [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts) ; le rapport `receivables` (créances) est **déjà exportable** — [`convex/assistant.ts:483`](../../convex/assistant.ts#L483), [`src/lib/assistantExports.ts:133`](../../src/lib/assistantExports.ts#L133).
- **Queries clients** réutilisables : `getClients` (tous, actifs/inactifs) — [`convex/clients.ts:14`](../../convex/clients.ts#L14) ; `searchClients` — [`convex/clients.ts:47`](../../convex/clients.ts#L47) ; `getClient` / `getClientLedger` — [`convex/clients.ts:101`](../../convex/clients.ts#L101), [`convex/clients.ts:184`](../../convex/clients.ts#L184) ; `getReceivables` — [`convex/clients.ts:147`](../../convex/clients.ts#L147) ; `analytics.getSalesByClient` — [`convex/analytics.ts:125`](../../convex/analytics.ts#L125).
- **Données disponibles** : la table `clients` porte `createdAt`, `type` (particulier/grossiste), `balance` (encours), `phone`, `quartier`, `createdByName`, `isActive` — [`convex/schema.ts:26`](../../convex/schema.ts#L26). Les ventes portent `clientId`, `date`, `paymentMethod`, `paymentStatus`, `amountDue` — [`convex/schema.ts:98`](../../convex/schema.ts#L98).
- **Agrégations role-gated** (`requireStaff` = admin/manager) + helpers `startTs`/`endTs` (AAAA-MM-JJ → ms) dans [`convex/analytics.ts:10`](../../convex/analytics.ts#L10), [`convex/analytics.ts:21`](../../convex/analytics.ts#L21).
- Rendu Markdown des réponses (story 1.6) — [`src/components/assistant/MarkdownMessage.tsx`](../../src/components/assistant/MarkdownMessage.tsx).

### Ce qui manque (le périmètre de CETTE story)

1. **L'IA ne sait pas LISTER ni SEGMENTER les clients.** Elle ne peut que **rechercher** un client déjà connu (`search_clients`, max 10, actifs) ou consulter les **débiteurs** (`get_receivables`). Impossible de répondre à « mes **nouveaux clients** de juin », « tous mes **grossistes** », « qui n'a **plus acheté** depuis longtemps », « mes **meilleurs clients** du trimestre ». → c'est le cœur de la demande (« accès aux nouveaux clients »).
2. **Pas de notion de « nouveau client ».** `createdAt` existe mais aucune query ne filtre/trie les clients par date de création, ni n'indique si un nouveau client a **déjà acheté** (pour l'accueillir / le relancer).
3. **Pas de relance par inactivité.** Aucune query ne croise les clients **actifs** avec la **date de leur dernier achat** pour repérer ceux à réactiver.
4. **Pas de classement clients.** Aucune query ne classe les clients par **montant acheté** sur une période (pour repérer les VIP et bâtir des recommandations ciblées).
5. **Créances sans ancienneté.** `get_receivables` trie par **montant** mais n'indique **pas depuis quand** la dette court (pas d'« aging ») → impossible de prioriser les **relances crédit** par retard.
6. **Pas d'export de listes clients pour relance.** Le pipeline 1.6 exporte `receivables`, mais **pas** une liste « nouveaux clients » / « clients inactifs » / « meilleurs clients » imprimable (liste d'appels avec téléphones).

### Principes (inchangés depuis 1.5/1.6 + précisions relances)

- **Admin uniquement, LECTURE SEULE.** Aucune mutation d'écriture n'est exposée à l'IA. Toutes les nouvelles capacités sont des **queries Convex** role-gated (`requireStaff`) exécutées en contexte admin (auth propagée par `ctx.runQuery`).
- **Relances = préparation, pas envoi.** L'IA **prépare** la relance : elle dresse la **liste des clients à contacter** (avec téléphone) et peut **proposer un message type**, mais elle **n'envoie AUCUN** SMS / appel / WhatsApp et **ne crée/modifie aucun** client. Pour contacter quelqu'un, elle renvoie vers l'écran **Clients** (ou le téléphone affiché). L'envoi automatisé de relances (intégration SMS/WhatsApp, cron) est **hors scope** (cf. plus bas).
- **Recommandations = raisonnement du modèle sur les données**, pas un moteur ML : l'IA croise les outils (top clients × ce qu'ils achètent via `get_client_detail`/`get_top_products`) et propose. Elle n'invente jamais un chiffre/nom (règle absolue du `SYSTEM_PROMPT`).
- **PII autorisée** (décision 1.5 inchangée) : nom + **téléphone** sont nécessaires aux relances.
- **Ancrage par outils** : les nouveaux outils mappent des queries ; résultats **tronqués** (cap `MAX_TOOL_RESULT_CHARS`) et listes **bornées** (`limit`).
- **Exports = client-side** (cohérent 1.6) : `prepare_export` **valide + compte** les lignes côté serveur ; le **navigateur** re-récupère le jeu complet via la query admin puis fabrique le fichier.

## Acceptance Criteria

1. **Queries d'intelligence clients (lecture seule, admin/manager)** — Ajout dans [`convex/analytics.ts`](../../convex/analytics.ts) (toutes via `requireStaff`, listes bornées, dates en `AAAA-MM-JJ` comme les autres agrégations) :
   - `getRecentClients({ startDate?, endDate?, days?, type?, includeInactive?, limit? })` → clients triés **par `createdAt` décroissant** (les plus récents d'abord), filtrés par fenêtre de création (`startDate`/`endDate` **ou** `days` derniers jours) et par `type`, **enrichis** : `displayName`, `reference`, `phone`, `quartier`, `type`, `createdAt`, `createdByName`, `balance`, `purchaseCount`, `lastPurchaseAt` (null si jamais), `totalPurchased`. Sans fenêtre → tous les clients actifs (bornés, plus récents d'abord).
   - `getInactiveClients({ days?, type?, includeNeverPurchased?, limit? })` → clients **actifs** dont le **dernier achat** date de plus de `days` jours (défaut **30**), `includeNeverPurchased` (défaut `true`) inclut ceux qui n'ont **jamais** acheté ; triés par **inactivité décroissante** (jamais acheté en tête, sinon le plus ancien dernier achat d'abord) ; enrichis : `lastPurchaseAt`, `daysSinceLastPurchase` (null = jamais), `purchaseCount`, `balance`, `phone`, `quartier`, `type`.
   - `getTopClients({ startDate?, endDate?, limit? })` → clients classés par **montant acheté décroissant** sur la période ; enrichis : `totalAmount`, `purchaseCount`, `totalQuantity`, `lastPurchaseAt`, `byProduct` (produits achetés, triés), `balance`, `phone`, `type`, `displayName`. Ignore les ventes anonymes (sans `clientId`).
   - `getReceivablesAging({ limit? })` → débiteurs (encours > 0, actifs) **avec ancienneté** : `oldestUnpaidDate` (date de la plus ancienne vente à crédit **impayée**), `daysOverdue`, `unpaidSalesCount`, `balance`, `phone`, `quartier`, `type`, `displayName` ; triés par **`daysOverdue` décroissant** ; + `totalOutstanding`, `debtorCount`. **N'altère PAS** `getReceivables` (nouvelle query distincte → zéro régression du tool/export existant).

2. **Nouveaux outils IA (mappent les queries ci-dessus)** — Le registre `TOOLS` expose, en plus des existants : `list_clients` → `getRecentClients` (lister/parcourir les clients, **filtrer les nouveaux** par période de création + type) ; `get_inactive_clients` → `getInactiveClients` ; `get_top_clients` → `getTopClients` ; `get_credit_relances` → `getReceivablesAging`. Chaque outil mappe **une** query existante, s'exécute en contexte admin, **tronque** son résultat et **borne** sa liste. **Aucun outil n'écrit.**

3. **`SYSTEM_PROMPT` enrichi (clients + relances)** — Le prompt cite brièvement les nouveaux domaines disponibles (lister/segmenter les clients, nouveaux clients d'une période, clients inactifs, meilleurs clients, relances crédit par ancienneté) pour guider la sélection d'outils, **sans coder le modèle en dur**. Il rappelle que : (a) une **recommandation** se construit en **croisant** les outils (ne jamais inventer) ; (b) **les relances sont en LECTURE SEULE** — l'IA **prépare** la liste/le message type mais **n'envoie rien** et **ne modifie aucun** client (renvoyer vers l'écran Clients / le téléphone) ; (c) pour une **liste imprimable** de relance, utiliser `prepare_export`.

4. **Export de listes clients pour relance** — `prepare_export` accepte trois nouveaux `report` : `new_clients`, `inactive_clients`, `top_clients` (format `pdf`|`xlsx`). Côté serveur, `countReportRows` et `exportTitle` gèrent ces rapports (comptage via les nouvelles queries, titre lisible — pour `inactive_clients`, mentionner le seuil de jours). Côté client, [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts) (`buildReport`) fabrique chaque fichier en re-récupérant les données complètes via la query correspondante, avec des colonnes **incluant le téléphone** (liste d'appels) : nom, référence, téléphone, quartier, type, + colonnes spécifiques (date de création / dernier achat / jours d'inactivité / montant acheté / encours). Le type `ReportKey` reste **synchronisé** front/back. 0 ligne → message « aucune donnée », pas de fichier.

5. **Sécurité & garde-fous (inchangés + nouveaux)** — Toutes les nouvelles queries sont `requireStaff` ; tous les nouveaux outils et nouveaux rapports d'export passent par l'action **admin only**. **Aucune** mutation métier ajoutée/exposée à l'IA. Le prompt rappelle la lecture seule pour les relances (préparer ≠ envoyer/modifier). Rendu Markdown toujours **sans HTML brut**. Clé DeepSeek **100 % serveur**.

6. **Robustesse & non-régression** — Les agrégations clients scannent les ventes de façon maîtrisée (un seul passage pour bâtir la table « dernier achat » ; lectures `by_client` bornées pour les sous-ensembles) et bornent leurs sorties (`limit`, défaut/max) ; résultats tronqués au cap existant. La boucle ≤ 6 itérations et le dernier tour `tool_choice: "none"` restent valides avec le registre élargi. `getReceivables`/`get_receivables`/export `receivables` et tous les outils/conversations existants **inchangés**. `npx convex codegen` + `npm run build` (`tsc -b && vite build`) + `npx eslint` (fichiers modifiés) → **0 erreur**. (Test live DeepSeek : nécessite `DEEPSEEK_API_KEY`, cf. Dev Notes.)

## Tasks / Subtasks

- [x] **Task 1 — Queries d'intelligence clients** (AC: 1, 5, 6) — [`convex/analytics.ts`](../../convex/analytics.ts)
  - [x] `getRecentClients` : `requireStaff` ; charger `clients` (filtrer `isActive` sauf `includeInactive`) ; filtre `type` (défaut `particulier` si absent) ; fenêtre de création : si `startDate`/`endDate` → bornes via `startTs`/`endTs` sur `createdAt` ; sinon si `days` → `createdAt >= Date.now() - days*86400000`. Trier `createdAt` desc, `slice(limit ?? 50, max 200)`. **Enrichir** le sous-ensemble retenu via l'index `by_client` (peu de lignes) : `purchaseCount`, `lastPurchaseAt = max(date)`, `totalPurchased = Σ total`. Renvoyer aussi `displayName` (helper `formatClientName` — exporter/dupliquer depuis `clients.ts`).
  - [x] `getInactiveClients` : `requireStaff` ; **un seul passage** sur `sales` (index `by_date`/collect) pour bâtir `Map<clientId, lastDate=max(date)>` (ignorer ventes sans `clientId`) ; charger clients **actifs** (+ filtre `type`) ; pour chacun calculer `daysSinceLastPurchase` (null si jamais) ; garder ceux **sans achat** (si `includeNeverPurchased`) **ou** `daysSinceLastPurchase > days` (défaut 30) ; trier inactivité desc (jamais en tête), `slice(limit ?? 50, max 200)`. Enrichir `balance`, `phone`, `quartier`, `type`, `purchaseCount`.
  - [x] `getTopClients` : `requireStaff` ; scanner `sales` sur `[startTs(start), endTs(end)]` (index `by_date` + filtre) ; grouper par `clientId` (ignorer null) : `totalAmount`, `purchaseCount`, `totalQuantity`, `lastPurchaseAt`, `byProduct` (Map nom→{qty,amount}) ; joindre le doc client (`ctx.db.get`) pour `displayName`/`phone`/`balance`/`type` ; trier `totalAmount` desc, `slice(limit ?? 10, max 100)`.
  - [x] `getReceivablesAging` : `requireStaff` ; clients actifs avec `balance > 0` ; pour chacun, via `by_client`, filtrer ventes `paymentMethod === "credit" && paymentStatus === "unpaid"` → `oldestUnpaidDate = min(date)`, `unpaidSalesCount` ; `daysOverdue = floor((now - oldestUnpaidDate)/86400000)` (0 si pas de vente impayée datée) ; trier `daysOverdue` desc ; renvoyer `{ clients:[…], totalOutstanding, debtorCount }`, `slice(limit ?? 100, max 300)`.
  - [x] `formatClientName` : `clients.ts` la déclare en `function` non exportée ([`convex/clients.ts:583`](../../convex/clients.ts#L583)). **L'exporter** depuis `clients.ts` et l'importer dans `analytics.ts` (éviter la duplication), ou la recopier en helper local. Choisir l'export (DRY).

- [x] **Task 2 — Nouveaux outils + `SYSTEM_PROMPT`** (AC: 2, 3, 5) — [`convex/assistant.ts`](../../convex/assistant.ts) (constante `TOOLS` + `SYSTEM_PROMPT`)
  - [x] `list_clients` → `ctx.runQuery(api.analytics.getRecentClients, { startDate: str(a.startDate), endDate: str(a.endDate), days: num(a.days), type: a.type, includeInactive: !!a.includeInactive, limit: num(a.limit, 200) })`. Description : « Liste / parcourt les clients ; filtre les **nouveaux clients** par période de création (`startDate`/`endDate` ou `days`) et par `type` (particulier/grossiste). Triés du plus récent au plus ancien. »
  - [x] `get_inactive_clients` → `getInactiveClients` (`days?`, `type?`, `includeNeverPurchased?`, `limit?`). Description orientée **relance** : clients sans achat récent à réactiver.
  - [x] `get_top_clients` → `getTopClients` (`startDate?`, `endDate?`, `limit?`). Description : meilleurs clients par montant acheté (base des recommandations).
  - [x] `get_credit_relances` → `getReceivablesAging` (`limit?`). Description : débiteurs à relancer **par ancienneté** de la dette (`daysOverdue`).
  - [x] Schémas JSON `parameters` cohérents (types `string`/`integer`/`boolean`, `additionalProperties:false`) ; réutiliser les helpers `str`/`num` existants ([`convex/assistant.ts:66`](../../convex/assistant.ts#L66)).
  - [x] `SYSTEM_PROMPT` : ajouter un paragraphe **Clients & relances** (cf. Dev Notes pour le texte) — domaines disponibles + recommandation = croisement d'outils + **relances en lecture seule (préparer ≠ envoyer/modifier)** + possibilité de `prepare_export` (new_clients/inactive_clients/top_clients).
  - [x] Vérifier que chaque `run` reste **lecture seule** et que le résultat passe par `truncate`.

- [x] **Task 3 — Export des listes clients (serveur + client)** (AC: 4, 5, 6) — [`convex/assistant.ts`](../../convex/assistant.ts) + [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts)
  - [x] **Backend** : étendre `ReportKey` ([`convex/assistant.ts:456`](../../convex/assistant.ts#L456)) et `REPORT_LABELS` ([`convex/assistant.ts:473`](../../convex/assistant.ts#L473)) avec `new_clients` (« Nouveaux clients »), `inactive_clients` (« Clients inactifs »), `top_clients` (« Meilleurs clients »).
  - [x] Ajouter l'enum correspondant dans `PREPARE_EXPORT_DEF.parameters.report` ([`convex/assistant.ts:483`](../../convex/assistant.ts#L483)) + un paramètre optionnel `days` (pour `inactive_clients`/`new_clients`) au schéma de `prepare_export` (et le propager dans `params`).
  - [x] `countReportRows` ([`convex/assistant.ts:523`](../../convex/assistant.ts#L523)) : 3 cas → `.length` de `getRecentClients` / `getInactiveClients` / `getTopClients` (mêmes args que les outils).
  - [x] `exportTitle` ([`convex/assistant.ts:595`](../../convex/assistant.ts#L595)) : pour `inactive_clients`, intégrer le seuil (ex. « Clients inactifs (≥ 30 j) ») ; pour `new_clients`/`top_clients`, réutiliser la logique période existante.
  - [x] **Frontend** : dans [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts), étendre le type `ReportKey` ([`src/lib/assistantExports.ts:12`](../../src/lib/assistantExports.ts#L12)) (rester **aligné** avec le backend) et ajouter 3 `case` à `buildReport` :
    - `new_clients` → `api.analytics.getRecentClients` ; colonnes : Nom, Référence, Téléphone, Quartier, Type, Créé le, Dernier achat, Nb achats, Total acheté (FCFA).
    - `inactive_clients` → `api.analytics.getInactiveClients` ; colonnes : Nom, Référence, Téléphone, Quartier, Type, Dernier achat, Jours inactif, Encours (FCFA).
    - `top_clients` → `api.analytics.getTopClients` ; colonnes : Nom, Référence, Téléphone, Type, Nb achats, Total acheté (FCFA), Dernier achat ; `totals` = Σ montant.
  - [x] **Dates** : ces queries prennent des `string` (`AAAA-MM-JJ`) / `number` (`days`) — **pas** de conversion en ms côté `buildReport` (contrairement à `sales`/`stock`). Passer `str(p.startDate)`, `str(p.endDate)`, `p.days as number | undefined`, `p.type`. Formater `createdAt`/`lastPurchaseAt` avec `formatExportDate` ; `-` si null.
  - [x] **Aucun** changement nécessaire dans [`src/pages/AssistantPage.tsx`](../../src/pages/AssistantPage.tsx) : les boutons d'export consomment déjà `m.exports` génériquement via `runAssistantExport` ([`src/lib/assistantExports.ts:272`](../../src/lib/assistantExports.ts#L272)). Vérifier seulement à l'exécution.

- [x] **Task 4 — Vérification** (AC: 6)
  - [x] `npx convex codegen` ; `npm run build` (`tsc -b && vite build`) ; `npx eslint` sur les fichiers modifiés → 0 erreur.
  - [x] Dérouler le plan de test manuel (Dev Notes) une fois `DEEPSEEK_API_KEY` configurée.

## Dev Notes

### Le point clé : exposer les bonnes vues, laisser le modèle raisonner

> La demande « recommandations / relances » ne nécessite **aucun moteur ML**. Il suffit de donner au modèle les **bonnes segmentations** (nouveaux / inactifs / top / débiteurs-âgés) ; le LLM **raisonne** dessus (croise top clients × `get_client_detail.byProduct`, repère un nouveau client sans achat, priorise une relance crédit par `daysOverdue`) et propose un plan d'action + un message type. L'IA **prépare** ; l'admin **agit** (téléphone, écran Clients).

Flux typique d'une relance :
```
1. Admin : « Qui dois-je relancer pour des crédits en retard ? »
2. DeepSeek → get_credit_relances → liste débiteurs triés par daysOverdue (avec téléphone, encours)
3. L'IA répond (Markdown) : tableau « Client | Téléphone | Encours | Retard (j) » + message type proposé
4. Admin : « Sors-moi ça en PDF » → prepare_export({report:'credit'… }) ⚠️ voir note ci-dessous
5. Bouton « 📄 … PDF » → liste d'appels imprimable (client-side)
```
> ⚠️ **Choix de périmètre export** : les **créances** sont déjà exportables via `report:'receivables'` (story 1.6). On **n'ajoute PAS** de rapport `credit_relances` distinct pour l'export (le tri par ancienneté est une **vue de lecture** ; pour l'imprimé, `receivables` suffit). Les **nouveaux** rapports d'export sont `new_clients`, `inactive_clients`, `top_clients` (listes non couvertes par 1.6).

### Pièges concrets (lus dans le code)

- **Formats de date — NE PAS confondre.** Les nouvelles queries `getRecentClients`/`getTopClients` prennent des **strings `AAAA-MM-JJ`** (comme `getSalesSummaryByPeriod`, via `startTs`/`endTs` — [`convex/analytics.ts:21`](../../convex/analytics.ts#L21)). À l'inverse, les outils `get_sales_detail`/`get_stock_movements` convertissent en **ms** (`toMs`). Donc **côté outils**, passer les dates clients en `str(a.startDate)` (pas `toMs`). **Côté `buildReport`** (front), ne pas appliquer `dayStartMs`/`dayEndMs` pour ces 3 rapports (contrairement à `sales`/`stock_movements`) — passer les strings telles quelles.
- **`createdAt` vs `_creationTime`.** `getClients` trie via `.order("desc")` (= `_creationTime` système) — [`convex/clients.ts:29`](../../convex/clients.ts#L29). Pour « nouveaux clients » filtrer/trier explicitement sur le champ métier **`createdAt`** (présent sur chaque doc), pas sur `_creationTime`.
- **`type` et `balance` optionnels.** `type` peut être absent → défaut `"particulier"` (cf. `c.type ?? "particulier"`). `balance` optionnel → `?? 0`. Reproduire ces défauts partout.
- **Ventes anonymes.** Beaucoup de ventes n'ont pas de `clientId` (client optionnel — [`convex/schema.ts:124`](../../convex/schema.ts#L124)). Les **ignorer** dans les agrégations par client (`getTopClients`, table « dernier achat »).
- **Coût des scans.** `getInactiveClients` a besoin du **dernier achat de chaque client actif** → bâtir **une seule** `Map<clientId,maxDate>` en un passage sur `sales`, puis itérer les clients (évite N requêtes `by_client`). `getTopClients` = un scan période. `getRecentClients`/`getReceivablesAging` n'enrichissent qu'un **sous-ensemble borné** → lectures `by_client` ciblées acceptables. Volumes mono-boutique modestes ; borner systématiquement (`limit`) + s'appuyer sur `truncate` (cap `MAX_TOOL_RESULT_CHARS` = 12000).
- **`formatClientName` non exportée.** Déclarée `function` privée dans `clients.ts` ([`convex/clients.ts:583`](../../convex/clients.ts#L583)). L'**exporter** (puis l'importer dans `analytics.ts`) pour éviter une 2ᵉ copie qui divergerait.
- **`getReceivablesAging` ≠ toucher `getReceivables`.** Créer une query **distincte**. Modifier `getReceivables` (ajouter l'aging) changerait la forme consommée par l'outil `get_receivables` ET l'export `receivables` (risque de régression). Nouvelle query = zéro régression.
- **`paymentStatus`/`amountDue` optionnels** sur les ventes legacy — traiter `paymentStatus ?? "unpaid"` et `amountDue ?? total` comme le fait déjà `getClientLedger` ([`convex/clients.ts:206`](../../convex/clients.ts#L206)).
- **`ReportKey` dupliqué** entre back ([`convex/assistant.ts:456`](../../convex/assistant.ts#L456)) et front ([`src/lib/assistantExports.ts:12`](../../src/lib/assistantExports.ts#L12)) : maintenir les **deux** unions synchronisées (commentaire « doit rester aligné » déjà présent).
- **`exhaustive switch`** : `countReportRows` et `buildReport` sont des `switch (report)` exhaustifs sur `ReportKey`. En ajoutant des clés, **ajouter les `case`** sinon TS signale un retour `undefined` / non-exhaustivité au build.
- **`requireStaff` renvoie `null`** pour caissier/non-authentifié ([`convex/analytics.ts:10`](../../convex/analytics.ts#L10)) → l'outil reçoit `null`, `executeTool` le passe au modèle qui dira « pas de données ». L'action étant admin, ce cas ne se produit pas en usage normal.

### `SYSTEM_PROMPT` — extrait à ajouter (paragraphe « Clients & relances »)

> Clients : pour **lister ou segmenter** les clients, utilise `list_clients` (filtre les **nouveaux clients** par période de création et par type particulier/grossiste). Pour préparer des **relances** : `get_inactive_clients` (clients sans achat récent à réactiver) et `get_credit_relances` (débiteurs triés par **ancienneté** de la dette). Pour repérer les **meilleurs clients** et bâtir une **recommandation**, `get_top_clients`, puis `get_client_detail` pour voir ce qu'un client achète. RELANCES — tu es en **LECTURE SEULE** : tu **prépares** la liste des clients à contacter (avec téléphone) et tu peux **proposer un message type**, mais tu **n'envoies aucun** SMS/appel/message et tu **ne crées/modifies aucun** client ; pour contacter quelqu'un, indique l'écran **Clients** ou le téléphone affiché. Pour une **liste imprimable**, utilise `prepare_export` (`new_clients`, `inactive_clients`, `top_clients`).

(Garder le reste du prompt inchangé ; ne pas coder le modèle ni des chiffres en dur.)

### Sécurité & accès (récap)

- Nouvelles queries : `requireStaff` (admin/manager). Nouveaux outils + nouveaux rapports d'export : passent par l'action `ask` **admin only** ([`convex/assistant.ts:862`](../../convex/assistant.ts#L862)). L'auth Clerk se propage via `ctx.runQuery`.
- **Aucune** mutation métier ajoutée/exposée à l'IA. La seule mutation de l'assistant reste `deleteConversation` (1.6), hors registre d'outils.
- PII (téléphone) volontairement incluse (relances). Rendu Markdown sans HTML brut (1.6 inchangé).

### Hors périmètre (stories ultérieures)

- **Envoi** automatisé de relances (intégration SMS / WhatsApp / e-mail, file d'envoi, accusés) — nécessiterait une **action d'écriture** + un fournisseur ; l'IA resterait en préparation.
- Surveillance **proactive** (cron quotidien : « 3 nouveaux clients cette semaine », « X débiteurs > 60 j ») — réutilisera ces queries.
- **Scoring RFM** / segmentation avancée (récence-fréquence-montant pondérée), churn prédictif — v1 = segmentations simples + raisonnement LLM.
- **Marge / rentabilité** par client (nécessite `products.costPrice` inexistant) — toujours hors scope.
- Déduplication de clients (même téléphone/nom) — hors scope.
- Export `credit_relances` dédié — couvert par `receivables` (1.6).

### Project Structure Notes

- **Backend** : [`convex/analytics.ts`](../../convex/analytics.ts) (4 nouvelles queries + import/export de `formatClientName`), [`convex/assistant.ts`](../../convex/assistant.ts) (4 nouveaux outils, `SYSTEM_PROMPT`, `ReportKey`/`REPORT_LABELS`/`PREPARE_EXPORT_DEF`/`countReportRows`/`exportTitle` étendus), [`convex/clients.ts`](../../convex/clients.ts) (exporter `formatClientName`). **Aucune** nouvelle table, **aucun** nouvel index (les index `by_active`, `by_client`, `by_date` existants suffisent).
- **Frontend** : [`src/lib/assistantExports.ts`](../../src/lib/assistantExports.ts) (type `ReportKey` + 3 `case` `buildReport`). **Pas** de changement de [`src/pages/AssistantPage.tsx`](../../src/pages/AssistantPage.tsx), du routing, ni de la Sidebar (la page Assistant existe depuis 1.5 ; les boutons d'export sont génériques depuis 1.6).
- **Réutilise** : `clients.getClient/getReceivables/getClientLedger`, `analytics.getSalesByClient`, helpers `startTs`/`endTs`, `str`/`num`/`toMs`, `formatExportDate`/`formatExportPrice`/`exportRowsToExcel`/`exportTableToPdf`.

### Tests (build + plan manuel — clé requise pour le live)

1. `npx convex codegen` + `npm run build` + `npx eslint` (fichiers modifiés) → 0 erreur.
2. **Nouveaux clients** : « Liste mes nouveaux clients de ce mois » → `list_clients` (fenêtre createdAt) → tableau avec date de création + indication s'ils ont déjà acheté. « Montre mes grossistes » → `list_clients` (`type:grossiste`).
3. **Recommandations** : « Quels sont mes meilleurs clients du trimestre et que leur recommander ? » → `get_top_clients` (+ éventuellement `get_client_detail` sur l'un d'eux) → liste VIP + suggestion ancrée sur `byProduct` (sans chiffre inventé).
4. **Relances inactivité** : « Quels clients n'ont plus acheté depuis 30 jours ? » → `get_inactive_clients` → liste triée par inactivité (avec téléphone, encours), + message type proposé. Vérifier que l'IA **n'envoie rien** (propose seulement).
5. **Relances crédit** : « Qui relancer en priorité pour les crédits en retard ? » → `get_credit_relances` → tri par `daysOverdue`.
6. **Export liste d'appels** : « Exporte les clients inactifs en Excel » → bouton « Clients inactifs … Excel » → `.xlsx` avec **téléphones** et **vrai** nombre de lignes. « Sors les nouveaux clients du mois en PDF » → `.pdf` lisible (en-tête LOCAGRI). Période vide → « aucune donnée », pas de fichier.
7. **Garde-fous** : « Envoie un SMS de relance à ce client » / « Crée ce client » → **refus lecture seule** + renvoi vers l'écran Clients. Question hors données → « Je ne sais pas… ». Compte **manager/caissier** appelant `ask` → refusé. Vérifier que `get_receivables` et l'export `receivables` (1.6) fonctionnent **toujours** (non-régression).

### References

- Stories précédentes (base) : [`docs/stories/1-5-assistant-ia-deepseek.md`](./1-5-assistant-ia-deepseek.md), [`docs/stories/1-6-assistant-ia-formatage-export-donnees.md`](./1-6-assistant-ia-formatage-export-donnees.md).
- [Source: convex/assistant.ts#L94] `TOOLS` ; [#L245] `search_clients` ; [#L257] `get_client_detail` ; [#L456] `ReportKey` ; [#L473] `REPORT_LABELS` ; [#L483] `PREPARE_EXPORT_DEF` ; [#L523] `countReportRows` ; [#L595] `exportTitle` ; [#L862] action `ask` (admin).
- [Source: convex/analytics.ts#L10] `requireStaff` ; [#L21] `startTs`/`endTs` ; [#L125] `getSalesByClient` ; [#L300] `getBusinessDashboard`.
- [Source: convex/clients.ts#L14] `getClients` ; [#L147] `getReceivables` ; [#L184] `getClientLedger` ; [#L583] `formatClientName` (à exporter).
- [Source: convex/schema.ts#L26] table `clients` (`createdAt`, `type`, `balance`, `phone`, `quartier`) ; [#L98] table `sales` (`clientId`, `date`, `paymentMethod`, `paymentStatus`, `amountDue`).
- [Source: src/lib/assistantExports.ts#L12] `ReportKey` (front) ; [#L74] `buildReport` ; [#L133] cas `receivables` (modèle de colonnes clients) ; [#L272] `runAssistantExport`.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] — workflow bmad-dev-story (implémentation séquentielle des 4 tâches) + revue adversariale multi-agents (5 lentilles : conformité AC, sécurité/lecture seule, exactitude du mapping d'export, exactitude des queries, régression) avec vérification adversariale de chaque finding (14 findings → 6 confirmés / 8 réfutés).

### Debug Log References

- `npx convex codegen` → OK (nouvelles queries `getRecentClients`/`getInactiveClients`/`getTopClients`/`getReceivablesAging`).
- `npx tsc -p convex/tsconfig.json` → exit 0 (avant et après corrections de revue).
- `npm run build` (`tsc -b && vite build`) → exit 0 (seul avertissement non bloquant : bundle > 500 kB, hérité de 1.6 — jspdf/xlsx).
- `npx eslint` (4 fichiers modifiés) → exit 0.
- Aucune nouvelle dépendance ; aucune nouvelle table ni nouvel index.

### Completion Notes List

- **AC1** — 4 queries lecture seule dans `convex/analytics.ts` (`requireStaff`, listes bornées, dates string `AAAA-MM-JJ`) : `getRecentClients` (nouveaux clients par fenêtre de création + type, enrichis `purchaseCount`/`lastPurchaseAt`/`totalPurchased`), `getInactiveClients` (inactifs ≥ N jours, jamais-acheté inclus, `daysSinceLastPurchase`), `getTopClients` (classement par montant, `byProduct`, `lastPurchaseAt`), `getReceivablesAging` (débiteurs avec `oldestUnpaidDate`/`daysOverdue`/`unpaidSalesCount`, **query distincte** → zéro régression de `getReceivables`). `formatClientName` exporté depuis `convex/clients.ts` et réutilisé (pas de duplication).
- **AC2** — 4 outils dans `TOOLS` (`list_clients`, `get_inactive_clients`, `get_top_clients`, `get_credit_relances`), chacun mappe une query, lecture seule, résultat tronqué (cap 12k). Registre : 19 → 23 outils + `prepare_export`.
- **AC3** — `SYSTEM_PROMPT` enrichi (paragraphe « Clients & relances ») : domaines disponibles + recommandation = croisement d'outils + **relances LECTURE SEULE** (préparer la liste/le message type, mais N'ENVOIE rien et ne crée/modifie aucun client → renvoi écran Clients / téléphone) + `prepare_export` pour les listes.
- **AC4** — Export `new_clients`/`inactive_clients`/`top_clients` (pdf|xlsx) : `ReportKey`/`REPORT_LABELS`/`PREPARE_EXPORT_DEF` (+ param `days`)/`countReportRows`/`exportTitle` étendus côté backend ; `buildReport` (front) fabrique les fichiers avec **téléphone** (liste d'appels), `ReportKey` synchronisé front/back, dates en string (pas de conversion ms). 0 ligne → « aucune donnée ».
- **AC5** — Toutes les queries `requireStaff` ; outils + exports passent par l'action admin only ; aucune mutation métier exposée à l'IA ; Markdown sans HTML brut ; clé DeepSeek serveur uniquement. (Revue : aucune nouvelle surface d'accès PII — `getClients`/`searchClients` préexistantes exposaient déjà le téléphone plus largement ; les nouvelles queries sont *plus* restrictives.)
- **AC6** — `getInactiveClients` = un seul passage sur `sales` (Map dernier-achat) ; enrichissements `by_client` sur sous-ensembles bornés ; sorties bornées (`limit`) + troncature ; boucle ≤ 6 itérations + dernier tour `tool_choice:"none"` inchangés ; `getReceivables`/`get_receivables`/export `receivables` intacts. Build + lint + codegen OK. (Test live DeepSeek : nécessite `DEEPSEEK_API_KEY`.)
- ⚠️ **Non testé en live** (pas de clé DeepSeek dans cet environnement) : validation = types/build/lint + revue adversariale. Avant prod : dérouler le plan de test manuel (section Tests) avec `DEEPSEEK_API_KEY`.

#### Corrections issues de la revue adversariale (6 findings confirmés / 14)

- ✅ **[MED] Coercition `days` divergente front/back** — Le descripteur stockait `params.days` brut ; le serveur (`num()`) coerçait une chaîne en nombre, le front l'ignorait → si le modèle émettait `days:"60"`, le fichier exporté utilisait un seuil différent (défaut 30) du `rowCount`/titre annoncé. **Corrigé** : `days` normalisé **à la source** dans `runPrepareExport` (`num(a.days)`) → le descripteur transporte toujours un `number` ; comptage serveur et fichier client consomment la même valeur.
- ✅ **[LOW] Export plafonné sous l'affichage chat** (2 findings, même cause) — `countReportRows`/`buildReport` n'envoyaient pas de `limit` → défauts serveur 50/50/**10** (`top_clients` plafonné à 10). **Corrigé** : `limit` explicite et **identique** côté serveur et front (`CLIENT_EXPORT_LIMIT=200`, `TOP_CLIENTS_EXPORT_LIMIT=100`, = max des queries) → l'export couvre toujours ≥ ce que le chat a montré, count == fichier.
- ✅ **[LOW] `getRecentClients` fenêtre incohérente `days` + `endDate`** — `days` (ancré sur « maintenant ») combiné à un `endDate` passé pouvait inverser la fenêtre → liste vide silencieuse. **Corrigé** : `days` rendu **exclusif** des bornes (`from === undefined && to === undefined`).
- ✅ **[LOW] Dates malformées → NaN → vide silencieux** — **Corrigé** : `getRecentClients`/`getTopClients` ignorent une borne `NaN` (borne ouverte) au lieu de filtrer à vide.
- ✅ **[LOW] `getInactiveClients` filtre vs colonne (écart d'un jour au bord)** — Le filtre (`< cutoff`) et `daysSinceLastPurchase` (flooré) pouvaient diverger d'un jour. **Corrigé** : filtre dérivé de la **même** valeur floorée (`daysSinceLastPurchase >= days`), `cutoff` supprimé → cohérent avec le titre « ≥ days j ».
- ℹ️ **8 findings réfutés** (faux positifs) après vérification : prose de Task ambiguë (« défaut particulier ») vs code conforme à l'AC ; niveau `requireStaff` (PII déjà exposée plus largement par l'existant) ; `includeInactive` non exposé à l'export (cohérent) ; full-scan `sales` documenté & accepté ; `daysOverdue=0` non atteignable hors données corrompues.

### File List

- `convex/clients.ts` — `formatClientName` exporté (réutilisé par analytics).
- `convex/analytics.ts` — 4 queries d'intelligence clients (`getRecentClients`, `getInactiveClients`, `getTopClients`, `getReceivablesAging`) + import `formatClientName` + `DAY_MS`.
- `convex/assistant.ts` — 4 outils (`list_clients`, `get_inactive_clients`, `get_top_clients`, `get_credit_relances`), `SYSTEM_PROMPT` (clients & relances), `ReportKey`/`REPORT_LABELS`/`PREPARE_EXPORT_DEF` (+ `days`)/`countReportRows`/`exportTitle` étendus, normalisation `days` à la source, constantes `CLIENT_EXPORT_LIMIT`/`TOP_CLIENTS_EXPORT_LIMIT`.
- `src/lib/assistantExports.ts` — type `ReportKey` + 3 `case` `buildReport` (`new_clients`/`inactive_clients`/`top_clients`, colonnes avec téléphone), constantes de plafond alignées.
- `convex/_generated/*` — régénérés.

## Change Log

| Date | Version | Description | Auteur |
|------|---------|-------------|--------|
| 2026-06-14 | 0.1 | Création de la story (évolution 1.5/1.6 : intelligence clients — nouveaux clients, inactifs, top clients, relances crédit par ancienneté + export des listes) | Claude Opus 4.8 |
| 2026-06-14 | 1.0 | Implémentation complète (4 tâches) : 4 queries analytics + 4 outils IA + SYSTEM_PROMPT + exports clients ; build/lint/codegen OK ; revue adversariale multi-agents | Claude Opus 4.8 |
| 2026-06-14 | 1.1 | Corrections revue (6 findings) : normalisation `days`, `limit` export aligné, fenêtre `getRecentClients` (days exclusif + NaN), filtre `getInactiveClients` ; re-build/lint OK ; statut → review | Claude Opus 4.8 |
