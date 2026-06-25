# CLAUDE.md — Operioz

Instructions et conventions pour les agents Claude Code travaillant sur ce projet.

## Convention YAGNI — plugin ponytail

Le plugin [ponytail](https://github.com/DietrichGebert/ponytail) est installé globalement sur ce serveur.
Il injecte automatiquement une règle YAGNI dans chaque session agent via des hooks `SessionStart` / `SubagentStart`.

**Principe** : avant d'écrire du code, grimper l'échelle — YAGNI → stdlib → plateforme native → dépendance existante → une ligne → minimum viable. Détail : `.claude/skills/ponytail.md`.

**Commandes** : `/ponytail`, `/ponytail lite|full|ultra`, `/ponytail-review`, `stop ponytail`.

---

## Lancer une session agent

Voir le skill → `.claude/skills/launch-agent.md`

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

> **⚠️ INTERDIT — variables d'environnement dans `.env.production`** — Ne jamais écrire une valeur d'env runtime (URL de backend, clé API, feature flag d'infra) dans `.env.production` committé. Ces variables se configurent **dans le dashboard du service de déploiement** (Cloudflare Pages : `wrangler pages secret put <KEY> --project-name <project>` ; Railway : dashboard env). `.env.production` ne contient que des constantes publiques non-sensibles (ex. titre de l'app, logo).

## Environnements — déploiement

**Staging = seul env de dev.** Il n'existe pas d'env de développement local distinct ; tout test d'intégration / vérification navigateur se fait sur staging.

### Frontend (Cloudflare Pages)

Déployé via **intégration GitHub** : un push sur la branche `staging` déclenche automatiquement un build CF Pages. Aucun script de déploiement manuel.

Variables build-time (`VITE_*`) → à configurer dans le **projet CF Pages** (ces variables sont disponibles pendant le build CF, Vite les bake dans le bundle) :
```bash
wrangler pages secret put VITE_STRIPE_PUBLISHABLE_KEY --project-name artisan-staging
# (et non dans .env.production commité — la clé serait vide lors du build CF)
```

### Backend (Railway / Docker)

```bash
./scripts/deploy-backend.sh   # rebuild + smoke (health + auth)
```

Variables runtime → Railway dashboard (jamais dans `.env.production`).

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

## Provisionner la base (schéma + RLS)

Stack 100% PostgreSQL. Le schéma **ET** la sécurité niveau ligne (RLS) sont provisionnés par
**une seule chaîne de migrations Drizzle** (`drizzle/pg/`) — y compris l'isolation multi-tenant
(`0003_rls-tenant-isolation`) et l'accès public par token (`0004_rls-public-token`). Une base neuve
n'a donc plus besoin d'aucun script RLS manuel.

**⚠️ Créer une migration — TOUJOURS via drizzle-kit, JAMAIS à la main**

**Règle : deux migrations pour toute évolution de schéma significative**

1. **Migration auto** (tables, colonnes, FK simples, UNIQUE standards) — drizzle-kit diff automatique :
   ```bash
   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
     pnpm drizzle-kit generate
   # → drizzle/pg/XXXX_<nom-auto>.sql + entrée journal automatique
   ```

2. **Migration custom** (ce que Drizzle ne peut PAS auto-générer : index partiels `WHERE`, CHECK constraints, triggers, self-ref FK, RLS) :
   ```bash
   DATABASE_URL=... pnpm drizzle-kit generate --custom --name=<même-nom>-extras
   # → drizzle/pg/XXXX_<nom>-extras.sql VIDE + entrée journal
   # Remplir le SQL, puis : pnpm check ; redémarre le stack (task stack:restart) → appliqué au boot
   ```

Ne jamais créer un fichier `.sql` à la main ni éditer `drizzle/pg/meta/_journal.json` manuellement — drizzle-kit gère l'idx, le timestamp et l'entrée journal de façon atomique.

**Provision = AUTOMATIQUE au boot du serveur** (plus aucune étape manuelle oubliable). Au démarrage,
`apps/api/shared/db/provision-database.ts` exécute, sous un `pg_advisory_lock` (sûr en multi-réplicas)
et via la connexion OWNER (`DATABASE_URL`) :
1. **migrations** (schéma + RLS) par le SDK Drizzle `migrate()` ;
2. **(ré)assure le rôle applicatif** `app_tenant` (non-superuser, GRANTs + `ALTER DEFAULT PRIVILEGES`),
   provisionné à partir des identifiants de `APP_DATABASE_URL` (**source unique** du secret app).
Puis le serveur **refuse de démarrer** si le rôle runtime peut contourner la RLS (fail-closed).

**Deux rôles, deux URLs** (nommées par rôle, jamais croisées) :
- `DATABASE_URL` = `artisan_user` (owner) → provision au boot (migrations + grants). Connexion **éphémère**.
- `APP_DATABASE_URL` = `app_tenant` (non-superuser, RLS) → pool runtime qui sert **toutes** les requêtes.

**⚠️ Ne JAMAIS appliquer les migrations manuellement.** Après `drizzle-kit generate`, il suffit de déployer : `./scripts/deploy-backend.sh` reconstruit le conteneur et les migrations s'appliquent automatiquement au boot. Pas de `drizzle-kit migrate`, pas de `psql`, pas de `task stack:restart` pour ça.

**Faire évoluer la RLS** (ne JAMAIS éditer une migration appliquée — toujours une nouvelle migration custom append) :
- **Tenant** (nouvelle table avec `artisanId`/`artisan_id`) : `node scripts/rls/generate-tenant-rls.mjs`
  réintrospecte et crée une nouvelle migration custom **seulement si l'ensemble a changé** (sinon no-op).
- **Public-token** : éditer `drizzle/rls/public-token.sql` (référence) puis créer une migration custom à la main
  (cf. `0004`). `drizzle-kit generate --custom --name=… ` crée le fichier vide + l'entrée `_journal.json` à remplir.

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
REVIEW_FEEDBACK (corrections demandées par le reviewer — injecté comme prompt humain).

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
