# Agentic Factory — État des lieux & proposition d'architecture

**Date** : 2026-06-12 · **Auteur** : agent `agentic-factory-etat-des-lieux` (Opus 4.8)
**Projet Linear** : [Agentic Factory](https://linear.app/operioz/project/agentic-factory-2b4a835ded6f) (OPE)
**Statut du document** : proposition — à valider par un humain avant exécution

---

## 1. Résumé exécutif

Operioz dispose **déjà** d'un embryon d'usine à agents qui fonctionne en production de fait :
des sessions Claude Code détachées dans `screen`, lancées par un script
(`scripts/launch-claude-bg.sh`), pilotées par prompts (`scripts/prompts/`), coordonnées via
**Linear** (1 équipe, 7+ projets), et déjà productives — **317 documents d'audit** générés et
des correctifs poussés directement sur `staging`. Un mécanisme de **routines planifiées**
(« cron toutes les 7 min », projet Odoo benchmark) tourne via une session Claude longue durée.

**Ce qui marche** : le lancement d'agents, l'exécution de tâches longues, Linear comme backlog,
l'intégration Railway/Cloudflare, un garde-fou de drift de schéma DB.

**Ce qui manque pour une vraie factory** : il n'y a **aucune** orchestration supervisée (pas de
redémarrage sur crash, pas de registre des agents, pas de health-check), **aucun** protocole de
coordination inter-agents (deux agents peuvent réclamer la même issue), **aucune** isolation git
(tous les agents partagent le même checkout sur `staging`), **aucune** observabilité agrégée, et
**aucun** garde-fou de sécurité (tous les agents tournent en `--dangerously-skip-permissions` et
peuvent `git push` directement sur `staging`, qui se déploie).

**Le risque architectural n°1 n'est pas l'orchestration — c'est la codebase.**
`server/routers.ts` fait **10 081 lignes** et `server/db.ts` fait **7 154 lignes**. Ces deux
god-files concentrent presque toute la logique. Tant qu'ils ne sont pas découpés, l'ownership
par domaine et le parallélisme par worktree sont **illusoires** : tous les agents écrivent dans
les deux mêmes fichiers → conflits de merge permanents. **Découper ces fichiers est un
pré-requis, pas une optimisation.**

Recommandation : ne pas scaler le nombre d'agents avant d'avoir (a) découpé les god-files par
domaine, (b) posé un superviseur + un protocole Linear strict, (c) imposé une barrière PR + revue
humaine avant tout merge. Plan en 4 phases ci-dessous.

---

## 2. État des lieux (l'existant)

### 2.1 Infrastructure d'agents

**Script de lancement — `scripts/launch-claude-bg.sh`**
Lance une session Claude Code détachée dans `screen`, survivant au shell parent :

```
claude --model <model> --permission-mode auto --dangerously-skip-permissions \
       --remote-control <session-name> ["$INIT_PROMPT"]
```

- Refuse les doublons de nom de session (bon réflexe).
- Modèle par défaut `claude-sonnet-4-6`, surchargeable.
- Prompt initial optionnel via fichier (`INIT_PROMPT=...`).
- **Tourne en `--dangerously-skip-permissions`** → autonomie totale, aucune barrière.

**Sessions `screen` actuellement vivantes** (`screen -ls`) :

| Session | Modèle | Rôle | Depuis |
|---|---|---|---|
| `operioz` | (interactif) | Session longue — **détient le lock des routines planifiées** (`~/.claude/scheduled_tasks.lock`, pid 619236) → c'est l'hôte de fait du « cron 7 min » | 03/06 |
| `project-manager` | sonnet-4-6 | PM / triage Linear | 12/06 12:09 |
| `ope-184-stack-analysis` | opus-4-8 | Analyse stack cible (OPE-184) | 12/06 12:22 |
| `agentic-factory-etat-des-lieux` | opus-4-8 | **Ce document** | 12/06 12:22 |

**Routines / tâches planifiées** : pas de `crontab` système (vide), pas de `/etc/cron.d` custom.
La planification passe par le **mécanisme de routines de Claude Code** : la session `operioz`
détient `scheduled_tasks.lock` et `~/.claude/tasks/<session>/`. C'est ce qui fait tourner le
benchmark Odoo « toutes les 7 min ». **Conséquence importante** : si la session `operioz` meurt,
toutes les routines s'arrêtent silencieusement — point de défaillance unique non supervisé.

**Prompts d'agents — `scripts/prompts/`** : un fichier markdown par mission
(`ope-184-stack-analysis.md`, `agentic-factory-etat-des-lieux.md`). Convention naissante :
prompt = spec de mission. Pas encore de prompts « rôle » réutilisables (un par domaine).

**`.claude/` (projet)** : uniquement `settings.local.json`. Contenu = **allow-list de permissions
accumulée automatiquement**, polluée et **dangereuse** :
- contient en clair le **mot de passe root de la DB Railway** et des **JWT de test/prod** ;
- des entrées corrompues (`__NEW_LINE_*__`, fragments de commandes).
- **Aucun hook**, **aucun sous-agent** (`.claude/agents/`), **aucune commande/skill custom**.

### 2.2 Outillage disponible

**MCP configurés** :
- **Linear** (`linear@claude-plugins-official`) — activé globalement. Backbone de coordination.
- **Railway MCP** (`railway-mcp-server`) — déploiement, logs, variables, services. Project-scope.

**Hooks Claude Code** : **aucun** (`PreToolUse`/`PostToolUse`/`Stop`… non configurés).
→ pas de garde-fou automatisé (ex. bloquer `git push` direct, lint avant commit).

**Skills / commandes custom** : **aucune** spécifique au projet (seulement les skills natives).

**CI/CD** : **aucune** — pas de `.github/workflows/`. La « CI » de fait = tests lancés à la main
(`pnpm test`) + déploiement Railway/Cloudflare. `Taskfile.yml` orchestre Docker, migrations
Drizzle et un **garde-fou de drift de schéma** (`db:check`) — le seul filet automatisé existant.

### 2.3 Codebase

**Stack** :
- Backend : **tRPC v11 + Express 4 + Drizzle ORM + MySQL2** (monolithe).
- Frontend : **React 19 + Vite** (`client/`, ~205 fichiers ts/tsx).
- Assistant IA : **`@google/genai` (Gemini)** — pas d'Anthropic SDK côté produit.
- Paiements : **Stripe** (`server/stripe/`, webhooks).
- PDF / e-facture : générateur PDF maison + **Factur-X** (`facturx.ts`).
- Infra : **Railway** (app) + **Cloudflare** (tunnels via `terraform/`, `functions/`, `wrangler`),
  `docker-compose.staging.yml`. Sous-module `odoo-ref` (Odoo 19, référence benchmark).

**Taille & forme** :
- Serveur : **48 fichiers TS, ~30 200 LOC**.
- **`server/routers.ts` = 10 081 LOC** (tout l'API tRPC dans un seul `appRouter`).
- **`server/db.ts` = 7 154 LOC** (toute la couche données).
- **80 tables** MySQL couvrant ~15 domaines métier identifiables.
- Tests : **20 fichiers vitest** (pattern `appRouter.createCaller(ctx)`), dont un test d'isolation
  multi-tenant — couverture partielle, centrée sécurité/sprints, **pas de CI pour les exécuter**.

**Domaines métier identifiables** (depuis les 80 tables) :

| Domaine | Tables clés |
|---|---|
| Devis / Facturation | `devis*`, `factures*`, `factures_recurrentes`, `modeles_devis*`, `signatures_devis` |
| Comptabilité | `ecritures_comptables`, `plan_comptable`, `exports_comptables`, `configurations_comptables` |
| Clients / CRM | `clients`, `avis_clients`, `demandes_avis`, `demandes_contact` |
| Portail client | `client_portal_access`, `client_portal_sessions`, `rdv_en_ligne` |
| Chantiers | `chantiers`, `phases_chantier`, `interventions_chantier`, `suivi_chantier`, `documents_chantier` |
| Techniciens / Terrain | `techniciens`, `positions_techniciens`, `interventions_mobile`, `historique_deplacements`, `disponibilites_techniciens` |
| RH | `conges`, `soldes_conges`, `objectifs_techniciens`, `permissions_utilisateur` |
| Stocks / Fournisseurs | `stocks`, `mouvements_stock`, `fournisseurs`, `commandes_fournisseurs*`, `articles*` |
| Véhicules | `vehicules`, `entretiens_vehicules`, `assurances_vehicules`, `historique_kilometrage` |
| Assistant IA | `ai_threads`, `ai_messages`, `analyses_photos_chantier`, `devis_genere_ia`, `suggestions_articles_ia` |
| Notifications | `notifications`, `push_subscriptions`, `historique_notifications_push`, `preferences_notifications` |
| Gamification | `badges`, `badges_techniciens`, `classement_techniciens` |
| Contrats | `contrats_maintenance`, `interventions_contrat` |
| Stats / Prévisions | `previsions_ca`, `historique_ca`, `config_alertes_previsions`, `rapports_personnalises` |
| Auth / Core | `users`, `artisans`, `sessions`, `audit_log`, `parametres_artisan` |

**Coordination Linear (déjà en place)** — équipe **Operioz (OPE)**, projets existants :
- **Agentic Factory** (créé aujourd'hui) — cette initiative.
- **Audit de la codebase** (cible 30/06) — adossé aux **317 docs d'audit** de `docs/audits/`.
- **Lancement 30 juin** (Urgent) — deadline produit dure.
- **Refonte progressive de la stack** (OPE-184) — Fastify/Hono + Postgres + clean archi.
- **Optimiser vitesse/latence**, **Odoo 19 benchmark** (cron 7 min), infra entreprise.

→ Linear est **déjà** le backlog et le canal de coordination de fait. La factory doit s'appuyer
dessus, pas le remplacer.

> **Next steps — État des lieux**
> 1. Inventorier précisément les routines planifiées actives (lesquelles, quel prompt, quelle
>    fréquence) — interroger la session `operioz`.
> 2. **Purger `~/.claude/scheduled_tasks.lock` du SPOF** : documenter quelle session le détient et
>    ce qui s'arrête si elle tombe.
> 3. **Rotation immédiate des secrets exposés** dans `settings.local.json` (mot de passe DB root,
>    JWT) + nettoyer le fichier. Voir §3.6.
> 4. Vérifier que `.claude/settings.local.json` est bien gité-ignoré (sinon fuite dans l'historique).

---

## 3. Gaps identifiés

### 3.1 Le bloqueur structurel : les god-files

`routers.ts` (10k LOC) et `db.ts` (7k LOC) rendent **impossible** un vrai ownership par domaine :
tout agent qui touche les devis, la compta ou les techniciens édite **ces deux mêmes fichiers**.
En parallèle (worktrees), cela garantit des conflits de merge sur chaque PR. **Sans découpage
modulaire préalable, la « factory scalable » ne tiendra pas.** C'est le gap n°1.

### 3.2 Orchestration

- Lancement **ad-hoc** (un humain exécute `launch-claude-bg.sh` ou crée une routine).
- **Pas de superviseur** : aucun redémarrage sur crash, aucun health-check, aucun registre central
  « qui tourne / qui possède quoi / depuis quand ».
- **SPOF** : les routines dépendent d'une unique session `operioz` non surveillée.
- Pas de limite de concurrence ni de budget (coût tokens non plafonné).

### 3.3 Communication inter-agents

- Linear existe mais **sans protocole** : pas de convention d'états, de labels, ni de mécanisme de
  **claim** (réservation) d'une issue. Deux agents peuvent travailler la même issue en double.
- Pas de canal de hand-off structuré (agent A finit → notifie agent B).
- Les 317 audits vivent en **markdown brut** ; tous ne sont pas convertis en issues actionnables.

### 3.4 Ownership & périmètres

- Aucune cartographie **domaine → agent → fichiers/routes/tables**.
- Aucun « contrat de frontière » entre domaines (qui a le droit de modifier `auth`, le schéma DB,
  les types partagés `shared/`).

### 3.5 Gestion des conflits git

- **Un seul checkout**, tous les agents travaillent sur `staging` (le `Taskfile` acte
  « plus de worktree séparé »).
- **Aucun worktree par agent**, aucun lock de fichier, aucune branche par tâche systématique.
- Les commits récents montrent des correctifs **poussés directement sur `staging`** (qui déploie).

### 3.6 Observabilité

- Logs = scrollback `screen` + dossiers de tâches. **Rien d'agrégé**, pas de dashboard, pas de
  recherche, pas de métriques (tâches/h, taux d'échec, coût).
- `audit_log` existe **en base applicative** mais ne couvre pas l'activité des agents.

### 3.7 Escalade humaine

- `agentPushNotifEnabled: true` (notifications push activées) mais **aucune politique** : quand un
  agent doit-il escalader ? Par quel canal ? Aujourd'hui : silence ou push non normé.

### 3.8 Sécurité

- Tous les agents en `--dangerously-skip-permissions` → peuvent tout faire, y compris `git push`
  et déployer via Railway MCP.
- **Pas de barrière PR**, pas de revue humaine obligatoire avant merge sur `staging`.
- **Secrets en clair** dans `settings.local.json` (DB root, JWT).
- Pas de hook bloquant (ex. interdire push direct sur `main`/`staging`).

> **Next steps — Gaps**
> 1. Acter le découpage des god-files comme **pré-requis P0** (issue Linear dédiée, voir §5).
> 2. Décider : barrière PR + revue humaine obligatoire **oui/non** (recommandé : oui). Voir §6.
> 3. Lister les domaines « sensibles » interdits aux agents sans revue (auth, schéma DB, Stripe,
>    `shared/`, terraform).

---

## 4. Architecture proposée

Principe directeur : **commencer petit, supervisé et sûr**, puis scaler une fois les god-files
découpés. On réutilise l'existant (screen, Linear, Railway MCP) plutôt que d'introduire une
nouvelle plateforme.

### 4.1 Vue d'ensemble

```
                       ┌──────────────────────────────┐
                       │   Humain (dev@operioz.com)    │
                       │  - revue PR  - décisions       │
                       └───────────────▲────────────────┘
                                       │ escalade (Linear @mention + push)
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        │                    ORCHESTRATEUR (superviseur)                │
        │  scripts/orchestrator/                                       │
        │  - registre des agents (registry.json)                       │
        │  - health-check + restart screen morts                       │
        │  - dispatch des issues Linear "Ready" → agent owner          │
        │  - garde-fous: concurrence max, budget tokens                 │
        └───┬───────────────┬───────────────┬───────────────┬──────────┘
            │               │               │               │
   ┌────────▼─────┐ ┌───────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
   │ agent:devis  │ │ agent:compta │ │ agent:tech   │ │ agent:review │
   │ worktree A   │ │ worktree B   │ │ worktree C   │ │ (lit, ne     │
   │ branche      │ │ branche      │ │ branche      │ │  pousse pas) │
   │ feat/ope-xxx │ │ feat/ope-yyy │ │ feat/ope-zzz │ │              │
   └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────────────┘
          │ PR             │ PR             │ PR
          └────────────────┴───────┬────────┘
                                    ▼
                        GitHub PR → CI (à créer) → revue humaine → merge staging
```

### 4.2 Agents à créer en priorité

On ne crée **pas** 15 agents d'un coup. Démarrage avec **5 rôles**, dont 1 seul « codeur » au
début pour valider la boucle complète sans multiplier les conflits :

| Priorité | Agent | Périmètre (ownership) | Droit d'écrire du code ? |
|---|---|---|---|
| P0 | **`orchestrator`** | Supervise, dispatch, health-check, escalade | Non (config only) |
| P0 | **`reviewer`** | Revue de PR, lint, tests, commentaires Linear | Non (revue seule) |
| P1 | **`refactor-modularization`** | Découpe `routers.ts`/`db.ts` par domaine | Oui (mission cadrée) |
| P1 | **`auditor`** | Continue les audits → convertit en issues Linear | Non (issues only) |
| P2 | **`domain:devis-factures`** | Devis/facturation (1er domaine codeur réel) | Oui |

Les agents codeurs par domaine (compta, techniciens, notifications…) ne sont activés
**qu'après** le découpage des god-files (P1) et la validation de la boucle PR (P0/P1).

### 4.3 Lancement & supervision

**Choix : `screen` + un orchestrateur léger, pas de supervisord (pour l'instant).**

Raison : `screen` + `launch-claude-bg.sh` marchent déjà et chaque agent EST un processus Claude
longue durée. Plutôt qu'ajouter `supervisord`/`systemd`, on écrit un **orchestrateur Node/bash**
qui :
1. lit `scripts/agents/<name>/agent.yaml` (modèle, prompt rôle, domaine, droits) ;
2. (re)lance les sessions `screen` manquantes via `launch-claude-bg.sh` ;
3. tient un **registre** `scripts/orchestrator/registry.json` (agent, pid, branche, worktree,
   issue en cours, dernière activité) ;
4. tourne lui-même comme une **routine planifiée** (le mécanisme « cron 7 min » déjà utilisé) au
   lieu de dépendre d'une session interactive non supervisée.

> Migration `supervisord` envisageable en Phase 4 si on dépasse ~6-8 agents permanents.

### 4.4 Protocole de communication (Linear-first)

**Linear = source de vérité.** Convention stricte à instaurer :

- **Cycle de vie d'une issue** : `Backlog → Ready → Claimed → In Progress → In Review → Done`.
- **Claim atomique** : un agent passe l'issue en `Claimed` **et** s'assigne **avant** de commencer.
  Règle : on ne touche qu'une issue `Ready` non assignée ; si déjà `Claimed`, on passe à la
  suivante. (Linear `save_issue` sert de verrou logique léger.)
- **Labels d'ownership** : `domain:devis`, `domain:compta`, … → routage orchestrateur → agent.
- **Hand-off** : commentaire structuré `@agent:<name> — handoff: <raison>` + ré-assignation.
- **Lien code↔issue** : branche `feat/ope-<id>-<slug>`, PR titrée `OPE-<id>: …`, commit
  `(ref OPE-<id>)` (convention déjà visible dans l'historique git → la garder).
- **Escalade** : commentaire `🚨 NEEDS-HUMAN: <raison>` + assignation à `dev@operioz.com` + push.

Pas de file de messages dédiée (Redis/queue) au début : **surdimensionné**. Linear + le registre
JSON suffisent jusqu'à ~10 agents.

### 4.5 Gestion des worktrees git

**Un worktree par agent codeur, une branche par tâche.**

```
/home/developer/artisan-mvp-temp        # checkout principal (staging) — orchestrateur, lecture
/home/developer/worktrees/devis         # git worktree → branche feat/ope-xxx
/home/developer/worktrees/compta        # git worktree → branche feat/ope-yyy
```

- Création : `git worktree add ../worktrees/<domain> -b feat/ope-<id>-<slug> origin/staging`.
- L'agent travaille **uniquement** dans son worktree, ouvre une **PR vers `staging`**, ne merge
  jamais lui-même.
- **Tant que les god-files ne sont pas découpés**, sérialiser les tâches qui les touchent (un seul
  agent à la fois dessus, géré par un label `touches:core-files` + lock dans le registre). C'est
  un pansement ; la vraie solution est le découpage (P1).

### 4.6 Structure de dossiers de la factory

```
scripts/
├── launch-claude-bg.sh          # existant — réutilisé
├── prompts/                     # existant — specs de mission ponctuelles
├── agents/                      # NOUVEAU — un dossier par agent
│   ├── orchestrator/
│   │   └── agent.yaml           # rôle, modèle, droits, domaine
│   ├── reviewer/
│   │   ├── agent.yaml
│   │   └── role.md              # prompt système de rôle (réutilisable)
│   └── devis-factures/
│       ├── agent.yaml
│       └── role.md
├── orchestrator/                # NOUVEAU — le superviseur
│   ├── supervise.mjs            # boucle: registry + health-check + (re)launch
│   ├── dispatch.mjs             # Linear "Ready" → agent owner
│   └── registry.json            # état runtime (généré)
└── factory/                     # NOUVEAU — conventions partagées
    ├── OWNERSHIP.md             # domaine → agent → routes/tables/fichiers
    ├── PROTOCOL.md              # cycle de vie Linear + escalade
    └── GUARDRAILS.md            # interdits, barrière PR, secrets
```

### 4.7 Sécurité & garde-fous

1. **Barrière PR obligatoire** : aucun agent ne `push` sur `staging`/`main`. Hook `PreToolUse`
   bloquant sur `git push` vers branches protégées. Merge = humain (ou `reviewer` + approbation
   humaine).
2. **Branch protection GitHub** sur `main` et `staging` (PR + 1 review requise). À activer côté GH.
3. **Domaines interdits sans revue humaine** : `server/_core/auth*`, schéma Drizzle, `server/stripe/`,
   `shared/`, `terraform/`, secrets. Listés dans `GUARDRAILS.md` + hook de blocage.
4. **Secrets** : rotation immédiate (DB root, JWT exposés), passage par variables d'env / Railway,
   `settings.local.json` nettoyé et confirmé git-ignoré.
5. **Budget & concurrence** : plafond de tokens/jour et nombre max d'agents codeurs simultanés dans
   l'orchestrateur.
6. **`--dangerously-skip-permissions`** conservé pour l'autonomie, **mais** compensé par les hooks
   bloquants + la barrière PR (l'autonomie s'exerce dans le worktree, pas sur les branches cibles).

> **Next steps — Architecture**
> 1. Écrire `scripts/factory/OWNERSHIP.md`, `PROTOCOL.md`, `GUARDRAILS.md` (squelettes).
> 2. Implémenter `supervise.mjs` minimal (registry + relance des sessions manquantes).
> 3. Ajouter un hook `PreToolUse` qui bloque `git push origin staging|main`.
> 4. Activer la branch protection GitHub sur `main` et `staging`.

---

## 5. Plan de mise en œuvre par phases

### Phase 0 — Sécuriser l'existant (jours, P0, **avant tout scaling**)
- Rotation des secrets exposés ; nettoyage `settings.local.json` ; vérif git-ignore.
- Branch protection GitHub (`main`, `staging`) + hook anti-push direct.
- Documenter le SPOF des routines (`operioz`) et le rendre supervisable.
- **Sortie** : impossible pour un agent de pousser/merger sans PR + revue.

### Phase 1 — Fondations factory (1-2 semaines, P0/P1)
- `scripts/factory/` (OWNERSHIP, PROTOCOL, GUARDRAILS).
- `orchestrator/supervise.mjs` + `registry.json` + health-check/restart.
- Agents `orchestrator` + `reviewer` opérationnels ; protocole Linear (états/labels/claim) appliqué.
- 1 worktree de démo + 1 PR de bout en bout (claim → branche → PR → revue → merge).
- **Sortie** : boucle complète validée sur **une** tâche réelle, sans intervention manuelle hors revue.

### Phase 2 — Découper les god-files (2-4 semaines, P1, **le vrai déblocage**)
- Agent `refactor-modularization` : éclate `routers.ts`/`db.ts` en modules par domaine
  (`server/devis/`, `server/compta/`, …), sans changer le comportement (couvert par tests).
- Ajouter une **CI GitHub Actions** (`pnpm check` + `pnpm test`) pour sécuriser le refactor.
- **Sortie** : ownership par domaine devient réel ; conflits de merge structurels éliminés.

### Phase 3 — Agents par domaine (continu, P2)
- Activer `domain:devis-factures` d'abord (domaine le mieux délimité après découpage).
- Convertir les 317 audits restants en issues `Ready` via l'`auditor`.
- Ajouter progressivement compta, techniciens, notifications — un domaine à la fois, en mesurant
  taux d'échec et conflits.
- **Sortie** : plusieurs agents codeurs en parallèle, livrant des PR mergées après revue.

### Phase 4 — Scale & durcissement (si besoin)
- Observabilité agrégée (logs centralisés + dashboard tâches/coût/échecs).
- Migration éventuelle `screen → supervisord/systemd` si >6-8 agents permanents.
- Politique d'escalade affinée ; réduction graduelle de la revue humaine sur domaines éprouvés.

> **Next steps — Plan**
> 1. Créer les issues Linear de Phase 0 et 1 dans le projet **Agentic Factory** et les prioriser.
> 2. Bloquer le démarrage de toute Phase 3 tant que Phase 2 (découpage) n'est pas faite.

---

## 6. Questions ouvertes / décisions humaines requises

1. **Barrière PR + revue humaine obligatoire** avant merge sur `staging` — **oui/non** ?
   *(Recommandation : oui. C'est le principal garde-fou contre un déploiement cassé par un agent,
   d'autant que `staging` déploie et que la deadline du 30/06 est dure.)*
2. **`staging` cible des PR ou bien une branche d'intégration `agents/integration`** dédiée pour
   isoler le travail des agents avant promotion vers `staging` ?
3. **Périmètre interdit** : confirmer la liste des zones réservées à l'humain (auth, schéma DB,
   Stripe, `shared/`, terraform). En ajouter/retirer ?
4. **Budget** : plafond de coût tokens/jour acceptable ? Nombre max d'agents codeurs simultanés ?
5. **Priorité produit vs factory** : la deadline **30 juin** est urgente. Construit-on la factory
   **en parallèle** du sprint de lancement, ou **après** ? *(Risque : investir dans la factory
   maintenant peut détourner de l'objectif 30/06. Recommandation : Phase 0 + Phase 1 légères
   maintenant, Phase 2 découpage **après** le lancement.)*
6. **Découpage des god-files** : validé comme pré-requis P1, ou accepte-t-on de scaler les agents
   malgré les conflits (déconseillé) ?
7. **SPOF routines** : qui possède la session `operioz` et peut-on la migrer vers une routine
   supervisée par l'orchestrateur ?

---

### Annexe — Honnêteté sur les risques

- **Ce document décrit une cible, pas une réalité.** Aujourd'hui la « factory » = quelques sessions
  screen autonomes sans filet. Tout ce qui est en §4-5 reste **à construire**.
- **Le découpage des god-files est risqué** (10k + 7k LOC, couverture de tests partielle, pas de CI).
  Le faire **avant** d'avoir une CI = jouer avec le feu. D'où l'ordre Phase 2 (CI **puis** refactor).
- **Autonomie 24/7 + `--dangerously-skip-permissions` + déploiement automatique** = combinaison à
  haut risque tant que la barrière PR n'est pas en place. **Ne pas laisser tourner d'agent codeur
  non supervisé avant la Phase 0.**
- **Ne pas sur-promettre la « coordination sans humain »** : à court terme, la revue humaine des PR
  reste indispensable. La factory réduit la charge humaine, elle ne la supprime pas.
