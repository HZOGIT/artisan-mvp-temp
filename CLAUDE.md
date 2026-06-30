# CLAUDE.md — Operioz

Instructions et conventions pour les agents Claude Code travaillant sur ce projet.

## Convention YAGNI — plugin ponytail

Le plugin [ponytail](https://github.com/DietrichGebert/ponytail) est installé globalement sur ce serveur.
Il injecte automatiquement une règle YAGNI dans chaque session agent via 3 hooks : `SessionStart` (démarrage), `SubagentStart` (sous-agents Task-spawned), `UserPromptSubmit` (commandes `/ponytail` et `stop ponytail` — léger, exit silencieux si pas de commande ponytail).

**Principe** : avant d'écrire du code, grimper l'échelle — YAGNI → stdlib → plateforme native → dépendance existante → une ligne → minimum viable. Détail : `docs/ponytail.md`.

**Commandes** : `/ponytail`, `/ponytail lite|full|ultra`, `/ponytail-review`, `stop ponytail`.

---

## Porte de validation humaine

**Tout changement NON-TRIVIAL ou RISQUÉ** passe par le statut Linear **`Awaiting Human Validation`** avant implémentation.

Catégories concernées (non exhaustif) :
- Migration de schéma / changement de BDD
- Modification de contrat/API (rupture de compatibilité)
- Registre central partagé (`MIGRATED_DOMAINS`, `permissions.ts`, etc.)
- Sécurité / authz / RLS
- Billing / argent (Stripe, facturation, comptabilité)
- RGPD / légal / archivage
- Architecture (nouveaux modules, dépendances majeures)
- Suppression de données
- Effets externes irréversibles (emails envoyés, webhooks, déploiements hors routine)

**Protocole PM** :
1. Créer l'issue dans le statut **`Awaiting Human Validation`** avec la proposition détaillée.
2. **Ne pas dispatcher** — attendre la validation explicite de l'humain (changement de statut ou commentaire « go »).
3. Sans validation → l'issue reste en attente, le PM la saute dans son cycle de dispatch.

**Changements triviaux / réversibles / locaux** (refacto, fix affichage, ajout de test, doc) = flux normal, sans porte.

**Le reviewer** ne merge pas une PR implémentant une catégorie risquée sans trace de validation humaine (issue passée par `Awaiting Human Validation` ou commentaire « go » explicite).

---

## Lancer une session agent

Voir le skill → `.claude/skills/launch-agent/SKILL.md` (ou `/launch-agent`)

**Principe** : le plan détaillé d'une tâche vit dans un **commentaire Linear** (pas dans un fichier
`.md` commité). Le script génère un bootstrap prompt qui dit à la session d'aller le lire.
Les fichiers `.md` dans `scripts/prompts/` sont réservés aux sessions **infrastructure** (reviewer,
worktree-footer) dont les instructions sont permanentes, pas task-specific.

```bash
# Tâche pilotée par une issue Linear (plan dans un commentaire sur OPE-XXX) :
LINEAR_ISSUE=OPE-487 ./scripts/launch-claude-bg.sh fix-pdf haiku
LINEAR_ISSUE=OPE-540 ./scripts/launch-claude-bg.sh impl-tva sonnet --worktree

# Session infrastructure (reviewer — instructions permanentes dans un fichier) :
INIT_PROMPT=./scripts/prompts/reviewer-agent.md ./scripts/launch-claude-bg.sh reviewer opus
```

### Modèles — guide de choix

| Alias | Modèle | Quand l'utiliser |
|---|---|---|
| `haiku` | claude-haiku-4-5-20251001 | Fix simple, recherche web, formatage, audit lecture seule |
| `sonnet` | claude-sonnet-4-6 | **Défaut** — implémentation, refacto, tests |
| `opus` | claude-opus-4-8 | Reviewer, architecture complexe, décisions critiques |

### Workflow par tâche (Linear → session)

1. Créer ou identifier l'issue Linear (ex. OPE-487)
2. Poster le plan détaillé en **commentaire** sur l'issue (instructions, fichiers à modifier, critères de done)
3. Lancer la session : `LINEAR_ISSUE=OPE-487 ./scripts/launch-claude-bg.sh <nom> <modèle> [--worktree]`
4. La session lit son plan depuis Linear et l'exécute

### Mode worktree + reviewer (recommandé pour les nouvelles features / fixes non urgents)

`--worktree` crée automatiquement un `git worktree` isolé à `/tmp/wt-<nom>` sur la branche
`feat/<nom>`, et injecte `scripts/prompts/_worktree-footer.md` dans le prompt. Ce footer
impose à l'agent de : committer sur sa branche → `gh pr create --base staging` → notifier
le reviewer via `notify.sh reviewer PR_READY`.

**Session reviewer** — persistante, lancée une seule fois :
```bash
INIT_PROMPT=./scripts/prompts/reviewer-agent.md ./scripts/launch-claude-bg.sh reviewer opus
```
Au démarrage, le reviewer crée un `CronCreate(*/5 * * * *)` pour se réveiller automatiquement.
À chaque tick il : liste les PRs ouvertes → checkout → `pnpm check` + lint → décide :
- **Corrections requises** : commente la PR sur GitHub + `notify.sh <session> REVIEW_FEEDBACK "message"`
  (injecté dans le terminal de la session comme si l'humain tapait).
- **PR approuvée** : `gh pr merge --squash` → kill screen worker + cleanup worktree →
  `deploy-backend.sh` si backend touché → mise à jour Linear (Done + lien PR) → `ntfy-pub.sh human`.

**Règle** : le reviewer ne merge jamais si `pnpm check` échoue ou si lint retourne des `error`.
Après 3 rounds de corrections sans avancée → `notify.sh human BLOCKED`.

**Types de messages bus** :
- `PR_READY` — envoyé par la session worker quand la PR est prête
- `REVIEW_FEEDBACK` — envoyé par le reviewer vers la session worker (demande de corrections)
- `SLOT_FREE` — envoyé par `slot-watcher` vers `project-manager` quand un slot se libère (format payload : `<actifs>/<cap> — <libres> libre(s)`) ; usage : `./scripts/agents/slot-watcher.sh start`

## Linear CLI — linearis

`linearis` est disponible sur ce serveur (v2026.4.9) et peut être utilisé par **tous les agents**
en complément ou à la place des outils MCP Linear.

```bash
# Lire une issue
linearis issues read OPE-XXX

# Lister les issues
linearis issues list --project "Points bloquants déploiement en production" --priority 2

# Créer une issue (team requis)
linearis issues create "titre" --team Operioz --priority 2 --parent-ticket OPE-XXX

# Mettre à jour statut / priorité
linearis issues update OPE-XXX --status "Done"
linearis issues update OPE-XXX --status "In Progress" --priority 2

# Poster un commentaire
linearis issues discuss OPE-XXX --body "markdown ici"
```

**Quand l'utiliser :** dans les sessions worktree où les outils MCP ne sont pas disponibles, ou
pour scripter des opérations Linear en cascade (plusieurs updates / commentaires d'un coup).
Les agents MCP peuvent continuer à utiliser les outils Linear MCP — les deux coexistent.

---

## Structure du projet

```
scripts/
  launch-claude-bg.sh          # Lance une session agent (--worktree pour isolation)
  prompts/                     # Prompts d'initialisation des sessions agents
    _worktree-footer.md        # Injecté auto dans tout prompt --worktree (protocole PR)
    reviewer-agent.md          # Prompt de la session reviewer persistante
  agents/
    notify.sh                  # Envoyer un message inter-agent (ou waker screen)
    listen.sh                  # Lire sa boîte de messages
    ntfy-pub.sh                # Push notification vers l'humain
    agents-status.sh           # Agents actifs + messages en attente
docs/
  architecture/                # Documents d'analyse et propositions techniques
  audits/                      # Rapports d'audit de la codebase
.claude/
  skills/                      # Skills et conventions pour les agents
eslint/
  comments-jsdoc-only.mjs      # Règle : // interdit sauf directives
  kebab-filename.mjs           # Règle : noms de fichiers kebab-case
  no-trpc-in-ui.mjs            # Règle : tRPC interdit dans la couche ui/
  no-direct-env-access.mjs     # Règle : process.env interdit hors config
  require-zod-input.mjs        # Règle : procédures tRPC doivent avoir .input()
  require-llm-tracking.mjs     # Règle : appels LLM doivent être tracés
```

> **⚠️ Répertoires INTERDITS à recréer** — le dossier `devtools/` a été dissout dans `scripts/` (commit `c1cb0b4f`). Ne jamais le recréer. Tout nouveau prompt va dans `scripts/prompts/`. Tout nouveau script va dans `scripts/`.

> **⚠️ INTERDIT — variables d'environnement dans `.env.production`** — Ne jamais écrire une valeur d'env runtime (URL de backend, clé API, feature flag d'infra) dans `.env.production` committé. Ces variables se configurent **dans le dashboard du service de déploiement** (Cloudflare Pages : `wrangler pages secret put <KEY> --project-name <project>` ; backend : fichier `.env` sur le serveur ou variables d'env Docker). `.env.production` ne contient que des constantes publiques non-sensibles (ex. titre de l'app, logo).

> **⚠️ Branches distantes protégées — NE PAS supprimer au ménage** — `main`, `staging`, et **`old-main`**. `old-main` est une **archive volontaire de l'état pré-refonte** (ancien main legacy/MySQL avant la migration clean-archi) conservée pour **comparer l'état actuel à l'avant-refonte**. Le ménage des branches (suppression des `feat/*` dont la PR est MERGED/CLOSED) doit **exclure** ces trois branches — même si `old-main` apparaît comme « mergée »/ancêtre de staging.

## Environnements — déploiement

**Staging = seul env de dev.** Il n'existe pas d'env de développement local distinct ; tout test d'intégration / vérification navigateur se fait sur staging.

### Frontend (Cloudflare Pages)

Déployé via **intégration GitHub** : un push sur la branche `staging` déclenche automatiquement un build CF Pages. Aucun script de déploiement manuel.

Variables build-time (`VITE_*`) → à configurer dans le **projet CF Pages** (ces variables sont disponibles pendant le build CF, Vite les bake dans le bundle) :
```bash
wrangler pages secret put VITE_STRIPE_PUBLISHABLE_KEY --project-name artisan-staging
# (et non dans .env.production commité — la clé serait vide lors du build CF)
```

### Backend (Docker / CF Tunnel)

```bash
./scripts/deploy-backend.sh   # rebuild + smoke (health + auth)
```

Variables runtime → fichier `.env` sur le serveur ou variables d'env Docker (jamais dans `.env.production`).

## Règle commentaires

**`//` interdit dans tout le code TypeScript** (règle ESLint `local/comments-jsdoc-only` active sur `apps/api/**` et `apps/web/src/**`).

- Utiliser `/** … */` pour les JSDoc
- Utiliser `/* … */` pour les blocs inline si absolument nécessaire
- Les séparateurs visuels (`// ── Section ──`) sont **interdits**
- Seules exceptions : directives TypeScript (`// @ts-ignore`, `// @ts-expect-error`, `// eslint-disable`) et directives de build (`// #region`)

Un `//` dans un fichier stagé fait échouer le pre-commit hook → vérifier avant de `git add`.

### Gates TypeScript

```bash
pnpm check                          # = tsc -p tsconfig.api.json && tsc -p tsconfig.web.json
tsc -p tsconfig.api.json --noEmit   # backend seul
tsc -p tsconfig.web.json --noEmit   # frontend seul (strict)
```

## Events de domaine — règle atomique obligatoire

**Toute émission d'event de domaine / outbox est TOUJOURS atomique avec le changement d'état.**

Règle DURE :
- `withOutbox` dans la MÊME transaction que la mutation métier → soit les deux persistent, soit aucun.
- **JAMAIS** best-effort : `this.db` hors-tx, `.catch(() => {})` qui avale, `emitEvent` asynchrone découplé.
- **JAMAIS** `SCREAMING_SNAKE_CASE` — convention FR minuscule (ex. `"notification.lue"`, `"facture.envoyée"`).

Best-effort toléré **uniquement** pour les side-effects non-métier **explicitement optionnels** (email transactionnel, stats, anti-flood) — jamais pour un event qu'un consommateur attend.

> Self-healing (`docs/architecture/ope-879-self-healing-proposal.md`) = filet de sécurité, **pas une excuse** pour émettre en best-effort. Un healing event récurrent sur le même invariant = bug à corriger à la source.

Pattern obligatoire (`apps/api/shared/events/with-outbox.ts`) :

```typescript
return withOutbox(db, repo, async (r, tx) => {
  await mutationMetier(r, ...);
  if (tx) await outboxEvent(tx, ctx.tenant, { action: "module.verbe", entityType: "...", entityId: ..., payload: { ... } });
  return result;
});
```

Test d'atomicité L2 obligatoire (`*.outbox.test.ts`) : vérifier que l'event est co-écrit dans `event_outbox` avec la mutation.

> 📖 Template complet + exemples → `docs/architecture/events-domaine-atomique.md`

---

## Provisionner la base (schéma + RLS)

> 📖 **Détail complet** (générer une migration, RLS en SQL custom, squash en préservant les données,
> pg-boss, migrer la BDD de test e2e) → skill **`migrations`** : `.claude/skills/migrations/SKILL.md`.

Stack 100% PostgreSQL. Schéma **ET** RLS = **une seule chaîne de migrations Drizzle** (dossier **`drizzle/`**),
appliquée **automatiquement au boot** par `apps/api/shared/db/provision-database.ts` (sous `pg_advisory_lock`) :
`runMigrations()` (runner maison — `apps/api/shared/db/run-migrations.ts`) applique les `.sql` de `drizzle/`
triés par nom (= ordre chronologique du timestamp), les trace dans le ledger `__migrations` (filename +
SHA-256), puis (ré)assure le rôle `app_tenant` → **fail-closed** si le rôle runtime peut contourner la RLS.
Une base neuve n'a besoin d'aucun script manuel.

> `_journal.json` n'est **plus la source de vérité runtime** : `drizzle-kit generate` l'écrit encore
> (cosmétique / traçabilité), mais le runner ne le lit que lors de la **bascule unique** depuis une BDD
> gérée par Drizzle (critère `folderMillis` ≤ max `created_at` du ledger Drizzle, cf.
> `docs/architecture/migration-runner-option-d.md` §7). Après bascule, tout se pilote par les noms de
> fichiers horodatés. Les conflits git sur `_journal.json` sont résolus **automatiquement** par le merge
> driver `drizzle-journal` (union + réindex idx, enregistré via `prepare`/`pnpm install`) — **ne jamais
> résoudre le journal à la main ni `git add _journal.json` manuellement**.

**Deux rôles, deux URLs** (nommées par rôle, jamais croisées) :
- `DATABASE_URL` = `artisan_user` (owner) → provision au boot (migrations + grants). Connexion **éphémère**.
- `APP_DATABASE_URL` = `app_tenant` (non-superuser, RLS) → pool runtime qui sert **toutes** les requêtes.

**Règles** (recettes détaillées dans la skill) :
- 🔴 **`generate` = BROUILLON, pas une migration finie.** `pnpm drizzle-kit generate` produit un `.sql`
  **indicatif** — le migrateur **DOIT le relire ligne par ligne et appliquer nos conventions manquantes**
  (RLS, index, CHECK, FK `ON DELETE`, sûreté sur données existantes) avant de committer. drizzle-kit oublie
  **systématiquement** la RLS et la plupart des index/contraintes. Une migration générée non relue/complétée
  = à rejeter. (Checklist : skill `migrations` §2.) **Jamais** de `.sql` à la main — `drizzle-kit generate` crée le fichier horodaté, `_journal.json` et le snapshot atomiquement. Conflits de merge sur `_journal.json` → gérés par le merge driver `drizzle-journal` (automatique). Vérif avant PR : `pnpm db:verify-journal`.
- **Migration custom** (ce que drizzle-kit ne génère PAS : RLS, CHECK, index partiels `WHERE`, triggers,
  self-ref FK) : `drizzle-kit generate --custom --name=<nom>` puis remplir le SQL. RLS tenant :
  `node scripts/rls/generate-tenant-rls.mjs`. RLS public-token : SQL canonique dans la skill.
- **Ne JAMAIS appliquer à la main** (`drizzle-kit migrate`/`psql`/`task stack:restart`) : déployer suffit
  (`./scripts/deploy-backend.sh`). BDD de **test** en retard (gate L2/L3/e2e → `column … does not exist`) :
  **`task db:provision`**.

## Jobs système / reconcilers : pool DB & RLS

**Un job système / reconciler / poller qui balaye PLUSIEURS tenants doit choisir le bon pool de connexion selon la RLS de la table cible.**

### Règle 1 — pool owner obligatoire pour les tables RLS-FORCE (cross-tenant)

| Table | RLS | Pool à utiliser |
|---|---|---|
| Toutes les tables tenant (factures, paiements_stripe, notifications, emails_log…) | **FORCE** | `getOwnerDbHandle` (owner) |
| `events`, `event_outbox` | OFF | `app_tenant` OK |

**Piège silencieux** : avec `app_tenant` sans `SET app.tenant` posé, toute policy RLS-FORCE renvoie **0 ligne** — le job semble tourner sans erreur mais ne fait **rien** (no-op silencieux). C'est la cause racine des incidents #382 et #386 (paiements non réconciliés FAC-20/FAC-00018, paiement Stripe jamais rapproché).

Règle pratique :
- Job/reconciler cross-tenant sur table RLS-FORCE → **`getOwnerDbHandle`**, pas `getDbHandle`.
- Contexte tenant normal (requête utilisateur) → `app_tenant` reste la règle ; `getOwnerDbHandle` est réservé aux jobs système.

### Règle 2 — TOUJOURS de VRAIS tests (anti false-green)

**Un test doit reproduire les conditions RÉELLES de prod, sinon il ment (vert à tort).**

- Les tests de jobs système / reconcilers / repos / RLS tournent **sous `APP_DATABASE_URL` (rôle `app_tenant`)**, **JAMAIS** sous `DATABASE_URL` (owner, qui bypasse la RLS). Un test en owner passe même quand le job est un no-op en prod → false-green.
- Le test doit **ÉCHOUER avant le fix** et **passer après** — pas de test de complaisance.
- Il reproduit le déclencheur réel : bon rôle (`app_tenant`), RLS active, tenant non posé pour les jobs cross-tenant.
- Tout reconciler/job système livré sans test sous `app_tenant` reproduisant le no-op = **à rejeter**.

Pattern récurrent (#347, #382, #386) : faux-test owner-bypass (voir aussi OPE-674), false-green cache ESLint.

> Pour les repos, passer `APP_DATABASE_URL` à vitest (jamais à la main pour la base de test) :
> ```bash
> DATABASE_URL="$(grep ^DATABASE_URL= .env.test.local | cut -d= -f2-)" \
>   node_modules/.bin/vitest run -c vitest.api.config.ts --no-file-parallelism <fichiers>
> ```

---

## Setup & Seeding

Le script `scripts/seed-data.ts` crée un jeu de données démo complet et idempotent (purge avant réinsertion).

### Seed simple (Plomberie Martin & Fils, Paris)

```bash
DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
pnpm exec tsx scripts/seed-data.ts
```

Crée 1 artisan + 10 clients + 5 techniciens + 15 articles + 8 devis + 5 factures + 4 chantiers + 12 interventions + 3 contrats + 4 fournisseurs + 5 notifications. **Mode défaut** — graphe tenant simple sans lignes de documents ni stocks.

### Seed riche (Plomberie Démo Lyon)

```bash
DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
pnpm exec tsx scripts/seed-data.ts --riche
```

Crée 1 artisan + 3 clients + 4 fournisseurs + 8 devis **avec lignes** + 6 factures **avec lignes** + 8 interventions + 4 commandes fournisseurs **avec lignes** + 15 stocks. **Mode complet** — graphe tenant avec documents structurés (invariants TVA vérifiés) et gestion stock.

### Propriétés

- **Idempotence** : chaque run purge l'ancien graphe du user démo AVANT réinsertion (repéré par `openId` unique)
- **Isolation** : chaque profil utilise un `openId` différent (seed simple ≠ seed riche), zéro risque de doublons croisés
- **Invariants financiers** : Σ(lignes.montantHT) = totalHT, TVA = 20 % (seed riche only)
- **Non destructif** : les autres comptes (artisans prod, test-data-user2, électricien, etc.) restent intacts

## Communication inter-agents

Tu peux faire partie d'une « Agentic Factory » : plusieurs sessions Claude Code
tournent en parallèle dans des `screen` nommés et se délèguent des tâches via un
bus de messages **sécurisé** (`~/.agent-bus/`, local par défaut). Ton nom
d'agent = le nom de ta session screen (auto-détecté). Conception complète :
[`docs/architecture/ope-185-inter-agent-communication.md`](docs/architecture/ope-185-inter-agent-communication.md).

### Envoyer un message
    ./scripts/agents/notify.sh <destinataire> <TYPE> "<message>"
Ex. : ./scripts/agents/notify.sh unit-tests TASK_DELEGATE "Module auth fini sur feat/auth, écris les tests unitaires."
Le destinataire `human` notifie l'humain.

### Recevoir un message
Quand on te réveille avec « 📨 [agent-bus] Nouveau message… », lis ta boîte :
    ./scripts/agents/listen.sh <ton-nom> --drain
Chaque message est une ligne JSON {from,to,type,payload,timestamp}. Agis selon
le TYPE, puis, si une étape suivante existe, renotifie l'agent concerné.

### Types
TASK_DELEGATE (prends cette tâche) · TASK_DONE (j'ai fini, enchaîne) ·
REQUEST_REVIEW (relis/valide) · BLOCKED (je suis bloqué) · ALERT (incident) ·
ACK (accusé de réception, optionnel) · PR_READY (PR GitHub prête pour review) ·
REVIEW_FEEDBACK (corrections demandées par le reviewer — injecté comme prompt humain) ·
SLOT_FREE (slot worktree libéré — envoyé par slot-watcher vers project-manager).

### Superviser
    ./scripts/agents/agents-status.sh   # agents actifs + messages en attente

### Sécurité
Par défaut tout reste LOCAL (aucun réseau ; `~/.agent-bus` en chmod 700). Le mode
multi-machine (ntfy) est chiffré de bout en bout et authentifié — n'utilise
jamais un ntfy public en clair.

### Exemple de délégation (chaîne type)
1. feature-dev finit de coder :
   ./scripts/agents/notify.sh unit-tests TASK_DONE "feature X mergée sur feat/x"
2. unit-tests (réveillé) écrit les tests, puis :
   ./scripts/agents/notify.sh qa-browser REQUEST_REVIEW "tests prêts pour feature X"
3. qa-browser fait le QA navigateur, puis prévient l'humain :
   ./scripts/agents/notify.sh human TASK_DONE "QA OK sur feature X, prêt à merger"

### Travailler sans détruire le travail des autres agents (branche partagée)

Plusieurs agents poussent **en parallèle sur la même branche `staging`**. Règle d'or :
**ne touche QUE ce qui te concerne**, laisse intact tout le reste.

- **Commit chirurgical.** Toujours `git add <chemins explicites>` de TES fichiers. **Jamais**
  `git add -A` / `git add .` / `git commit -a` : tu emporterais les fichiers non commités ou en
  cours d'édition d'un autre agent (prompts `scripts/prompts/`, audits `docs/billing/`,
  `docs/testing/`, etc.). Un `git status` peut montrer des `M`/`??` qui ne sont **pas à toi** —
  laisse-les.
- **Pousse toi-même par défaut, sans demander.** Une fois ton commit chirurgical fait, `git push`
  directement — pas besoin de valider avec l'humain. **N'attends et ne demande que si tu vois un
  risque** : `pnpm check`/lint rouge, propriété de fichier incertaine, réécriture d'historique,
  ou changement difficilement réversible / à effet externe. Rappel : un push sur `staging`
  **déclenche le déploiement frontend CF Pages** — c'est un push *et* un déploiement, garde-le en tête.
- **Ne réécris jamais l'historique partagé.** Pas de `git reset --hard`, `rebase`, `commit --amend`
  ni `push --force` sur `staging` : tu ferais disparaître les commits des autres.
- **Revérifie `origin` après push.** Un reset concurrent peut faire disparaître TON commit de la
  lignée poussée (déjà vu). Confirme : `git fetch origin staging` puis
  `git show origin/staging:<fichier> | grep <marqueur>`. Si ton commit a sauté, il reste
  récupérable : `git cat-file -t <sha>` puis `git cherry-pick <sha>`.
- **Après un déploiement, source git == bundle live.** Le déploiement build depuis la copie de
  travail, qui peut diverger de l'historique si un autre agent t'a reset sous les pieds. Vérifie
  que le fix est bien dans `origin/staging` ET dans l'artefact déployé.
- En cas de doute sur la propriété d'un fichier, **ne le commit pas** ; demande sur le bus
  (`notify.sh`) ou laisse-le à son auteur.

## Déboguer un problème front/intégration — utiliser un VRAI navigateur

Pour tout bug remonté côté **utilisateur** (page qui charge à l'infini, lien « expiré »,
404 après une redirection, section vide…), **reproduis-le avec un vrai navigateur AVANT de
diagnostiquer**. Un `curl` au niveau API peut mentir : il ne reproduit pas ce que le SPA envoie
réellement (cookies host-only, lots tRPC complets, redirections, service worker, en-têtes du proxy).

### Setup Playwright (docker, prêt à l'emploi)

    ./scripts/pw-run.sh scripts/staging-e2e-sweep.mjs

- `scripts/pw-run.sh <script.mjs> [VAR=val …]` exécute le script dans l'image
  `mcr.microsoft.com/playwright` (repo monté en lecture seule), zéro install locale.
- `scripts/staging-e2e-sweep.mjs` se connecte (`dev@operioz.com`, `E2E_PASS=Azerqsdf1234!`)
  et balaie toutes les routes SPA en collectant : erreurs console, `pageerror`, réponses
  `/api` 4xx-5xx, pages blanches. Sortie : `routes testées: N | issues: M` + un JSON détaillé.
- Une **passe automatique toutes les 5 min** (cron de session) rejoue ce balayage et n'alerte
  (ntfy) que s'il y a des `issues` — silence = tout vert.

### Tester les **mutations** front→tRPC (pas seulement le chargement des pages)

    ./scripts/pw-run.sh scripts/staging-e2e-mutations.mjs E2E_PASS='Azerqsdf1234!'

- `scripts/staging-e2e-sweep.mjs` ne fait que **charger** les routes (console/pageerror/4xx-5xx/page vide).
  Il **ne déclenche aucune action** → il ne voit PAS un bug de **contrat front↔backend** (ex. P1 du
  2026-06-16 : le front appelait `<module>.update({statut})` alors que le backend a des mutations de
  transition dédiées et **ignore silencieusement** `statut` → le statut ne changeait jamais, sans erreur).
- `scripts/staging-e2e-mutations.mjs` exerce de **vraies actions dans le navigateur** (clic UI réel →
  tRPC) puis **vérifie que l'effet PERSISTE** côté serveur (refetch). Sortie : `cas testés: N | issues: M`.
- **Le faire tourner fait partie de la recette de test** (en plus du sweep) — quand on (re)met en place
  les crons de testing, ils doivent lancer **les deux**.

### 🔒 RÈGLE — chaque correction de bug livre un test e2e PERSISTANT (anti-régression)

**Tout fix doit s'accompagner d'un test durable qui rejoue le déclencheur réel**, sinon le bug revient :

1. **Bug d'intégration front↔tRPC** (mutation ignorée, mauvais endpoint appelé, mismatch de contrat,
   page qui ne persiste pas une action) → **ajouter un cas dans `scripts/staging-e2e-mutations.mjs`**
   (action UI réelle + assertion de persistance), pas seulement une vérif manuelle jetable.
2. **Bug de logique backend** (use-case, calcul, garde) → **ajouter un test `vitest`** (`*.test.ts`) qui
   reproduit le cas, exécuté par le gate `vitest run src`.
3. **Bug de route/rendu** (page blanche, 4xx) couvert → s'assurer que la route est dans le sweep.

Ne jamais clore un fix sans : (a) le test persistant ajouté/committé, (b) le test **rouge avant / vert
après**, (c) la vérif au vrai navigateur du déclencheur d'origine. Un fix sans test anti-régression
durable est **incomplet**.

### Méthode (ce qui a marché, ce qui a piégé)

1. **Reproduis dans le navigateur**, pas seulement en API. Deux incidents réels où le curl trompait :
   - *Dashboard infini / portail « expiré »* → cause = `Fastify maxParamLength` (défaut 100) qui
     404-ait les **longs** lots `httpBatchLink` (`/api/trpc/p1,p2,…,pN`). Un curl avec un lot **court**
     (< 100 car.) répondait 200 → faux négatif. Seul le **vrai** lot du SPA (ou un long lot répliqué)
     déclenchait le 404. Fix : `Fastify({ maxParamLength: 5000 })`.
   - *404 après paiement Stripe (`/portail/<token>?paiement=succes`)* → cause = le dispatcher Pages
     supprime l'en-tête `host`, donc le backend bâtissait `success_url` sur l'hôte **interne**
     (`staging-newstack`) → Stripe renvoyait le navigateur vers le **backend**. Fix : le dispatcher
     pose `x-forwarded-host`/`x-forwarded-proto` (hôte public) et le backend les privilégie.
2. **Cookie d'auth = `token`** (PAS `auth_token`) — cf. `src/interface/http/auth-cookie.ts`.
3. **Vérifie au plus près du vrai chemin** : passe par l'edge public (`https://staging.operioz.com`),
   pas seulement par le backend en direct, pour inclure dispatcher + en-têtes + service worker.
4. **Confirme la correction de bout en bout** (ex. récupérer la session Stripe via l'API pour lire
   `success_url`), puis rejoue le balayage navigateur (`issues: 0`) avant de clore.
5. **Ajoute un garde-fou** (test anti-régression) qui reproduit le déclencheur réel — long lot tRPC,
   `x-forwarded-host` qui prime sur `host`, etc.

## Archivage électronique 10 ans (OPE-295 — Investigation en cours)

**Obligation légale** (Code de commerce Art. L.123-28-1, expert §11.7) : toute facture électronique doit être archivée à **valeur probante 10 ans** (Factur-X + PDF/A-3 + horodatage + piste d'audit).

**Statut** : SuperPDP (PA choisie) **ne clarifie PAS publiquement** s'il archive 10 ans. Investigation en cours (OPE-295).

### Stratégie et décision
- 👉 Docs : [`docs/architecture/ope-295-archivage-superpdp-findings.md`](docs/architecture/ope-295-archivage-superpdp-findings.md)

### Scénarios
| Cas | Action |
|-----|--------|
| **SuperPDP conforme 10 ans** | Noop — archivage PA seule, doc seule |
| **SuperPDP NON-conforme** | Intégrer SAE tiers (ADSN recommandé, voir plan implémentation) |
| **Réponse ambiguë** | Prudence → ajouter SAE en parallèle |

### Implémentation SAE tiers (si requis)
- 👉 Plan détaillé : [`docs/architecture/ope-295-sae-integration-plan.md`](docs/architecture/ope-295-sae-integration-plan.md)
- Abstraction `ArchivagePort` (symétrique `PaPort`)
- Adapter ADSN (recommandé : 0,01€/doc, REST API, NF Z42-013 en cours)
- Non-bloquant (parallèle PA) — archivage après émission SuperPDP

**Timeline** : attendre réponse SuperPDP (48h) → décider SAE oui/non → implémenter si requis (~1 semaine).

## Boucle autonome de tests (cron 10 min) — méthode de travail

Une session agent tourne en **boucle cron** pour combler les tests manquants du new-stack en continu.
La coexistence multi-agents suit la règle d'or ci-dessus (« Travailler sans détruire le travail des
autres agents ») — non redétaillée ici.

- **Mémoire persistante = un fichier `.md` de travail** (la context window est longue / se compacte).
  Réf : [`docs/testing/journal-tests-manquants.md`](docs/testing/journal-tests-manquants.md) — runbook,
  backlog, « prochaine cible », log d'itérations. **Relu à chaque réveil**, écrit à chaque pas. Le cron
  ne porte aucun état métier : juste « relis le journal et fais la prochaine cible ».
- **Colonne de tests par cas d'usage, par criticité** : on ne se limite PAS à l'unitaire. Par feature
  on vise un slice vertical **L1 unit (fakes) + L2 repo Drizzle/RLS + L3 router e2e (tRPC/HTTP) + L4
  navigateur (chemins critiques seulement)**. On **commence par les cas d'usage critiques** (portail
  public, signature, paiement, abonnement, auth, facturation, devis) puis on rétro-complète. Une
  itération avance la colonne d'UNE feature (1–3 fichiers). Exécution contre le **PG local bootstrappé**
  (`DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp`, rôle `app_tenant`
  + RLS) → commit chirurgical sur `staging`. Détail/ordre : `docs/testing/journal-tests-manquants.md`.
- **Déployer uniquement un fix `src/`** (`./scripts/deploy-backend.sh`) ; un ajout de test
  pur ne change pas le runtime → pas de déploiement.
- **Documenter sur 4 canaux** : (1) le journal `.md`, (2) **Linear** — issue parent de suivi (OPE-318)
  + **une issue enfant par itération** (« test(\<module\>): … », Done), (3) **ntfy**
  (`scripts/agents/ntfy-pub.sh`), (4) **bus inter-agents** (`scripts/agents/notify.sh`). Helper unique
  pour 1+3+4 : [`scripts/testing-loop/broadcast.sh`](scripts/testing-loop/broadcast.sh)
  `<tag> <titre> <message>`.

## Vérifier l'usage Claude en temps réel

Pour connaître l'état des quotas (fenêtre 5h + limite hebdomadaire) depuis n'importe quel terminal — sans interrompre les sessions actives :

```bash
SESSION="_usage_$$" && \
screen -dmS "$SESSION" bash -c "claude --model claude-haiku-4-5-20251001 --permission-mode auto" && \
sleep 9 && \
screen -S "$SESSION" -X stuff "/usage\r" && \
sleep 3 && \
screen -S "$SESSION" -X hardcopy /tmp/_usage_out.txt && \
cat /tmp/_usage_out.txt && \
screen -S "$SESSION" -X quit 2>/dev/null
```

**Ce que ça affiche :**
- Fenêtre 5h en cours : % utilisé + heure de reset
- Semaine en cours (tous modèles) : % utilisé + date de reset

**Pourquoi haiku :** modèle le plus léger, consomme le moins de quota pour cette vérification.

**Utilisation recommandée :** avant de lancer des sessions intensives (multi-agents, reviewer, sessions sonnet/opus longues) pour ajuster la charge si le quota hebdo est > 80%.
