# CLAUDE.md — Operioz

Instructions et conventions pour les agents Claude Code travaillant sur ce projet.

## Lancer une session agent

Voir le skill → `.claude/skills/launch-agent.md`

```bash
INIT_PROMPT=./devtools/prompts/<prompt>.md ./devtools/launch-claude-bg.sh <nom> [model]
```

## Structure du projet

```
devtools/
  launch-claude-bg.sh     # Lance une session agent en arrière-plan
  prompts/                # Prompts d'initialisation des sessions agents
docs/
  architecture/           # Documents d'analyse et propositions techniques
  audits/                 # Rapports d'audit de la codebase
.claude/
  skills/                 # Skills et conventions pour les agents
```

## Communication inter-agents

Tu peux faire partie d'une « Agentic Factory » : plusieurs sessions Claude Code
tournent en parallèle dans des `screen` nommés et se délèguent des tâches via un
bus de messages **sécurisé** (`~/.agent-bus/`, local par défaut). Ton nom
d'agent = le nom de ta session screen (auto-détecté). Conception complète :
[`docs/architecture/ope-185-inter-agent-communication.md`](docs/architecture/ope-185-inter-agent-communication.md).

### Envoyer un message
    ./devtools/agents/notify.sh <destinataire> <TYPE> "<message>"
Ex. : ./devtools/agents/notify.sh unit-tests TASK_DELEGATE "Module auth fini sur feat/auth, écris les tests unitaires."
Le destinataire `human` notifie l'humain.

### Recevoir un message
Quand on te réveille avec « 📨 [agent-bus] Nouveau message… », lis ta boîte :
    ./devtools/agents/listen.sh <ton-nom> --drain
Chaque message est une ligne JSON {from,to,type,payload,timestamp}. Agis selon
le TYPE, puis, si une étape suivante existe, renotifie l'agent concerné.

### Types
TASK_DELEGATE (prends cette tâche) · TASK_DONE (j'ai fini, enchaîne) ·
REQUEST_REVIEW (relis/valide) · BLOCKED (je suis bloqué) · ALERT (incident) ·
ACK (accusé de réception, optionnel).

### Superviser
    ./devtools/agents/agents-status.sh   # agents actifs + messages en attente

### Sécurité
Par défaut tout reste LOCAL (aucun réseau ; `~/.agent-bus` en chmod 700). Le mode
multi-machine (ntfy) est chiffré de bout en bout et authentifié — n'utilise
jamais un ntfy public en clair.

### Exemple de délégation (chaîne type)
1. feature-dev finit de coder :
   ./devtools/agents/notify.sh unit-tests TASK_DONE "feature X mergée sur feat/x"
2. unit-tests (réveillé) écrit les tests, puis :
   ./devtools/agents/notify.sh qa-browser REQUEST_REVIEW "tests prêts pour feature X"
3. qa-browser fait le QA navigateur, puis prévient l'humain :
   ./devtools/agents/notify.sh human TASK_DONE "QA OK sur feature X, prêt à merger"

### Travailler sans détruire le travail des autres agents (branche partagée)

Plusieurs agents poussent **en parallèle sur la même branche `staging`**. Règle d'or :
**ne touche QUE ce qui te concerne**, laisse intact tout le reste.

- **Commit chirurgical.** Toujours `git add <chemins explicites>` de TES fichiers. **Jamais**
  `git add -A` / `git add .` / `git commit -a` : tu emporterais les fichiers non commités ou en
  cours d'édition d'un autre agent (prompts `devtools/prompts/`, audits `docs/billing/`,
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
- **Déployer uniquement un fix `src/`** (`./devtools/deploy-staging-newstack.sh`) ; un ajout de test
  pur ne change pas le runtime → pas de déploiement.
- **Documenter sur 4 canaux** : (1) le journal `.md`, (2) **Linear** — issue parent de suivi (OPE-318)
  + **une issue enfant par itération** (« test(\<module\>): … », Done), (3) **ntfy**
  (`devtools/agents/ntfy-pub.sh`), (4) **bus inter-agents** (`devtools/agents/notify.sh`). Helper unique
  pour 1+3+4 : [`devtools/testing-loop/broadcast.sh`](devtools/testing-loop/broadcast.sh)
  `<tag> <titre> <message>`.
