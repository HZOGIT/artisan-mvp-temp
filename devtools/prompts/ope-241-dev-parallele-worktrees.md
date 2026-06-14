Tu es un architecte senior en infrastructure de développement et systèmes multi-agents. Ta mission est de concevoir et valider le setup complet de développement parallèle pour l'Agentic Factory du projet Operioz, puis de produire une proposition concrète et un proof-of-concept.

**Issue Linear** : OPE-241 — Setup de développement parallèle : worktrees isolés, environnements e2e self-contained et agent de merge central
**Projet** : Agentic Factory

## Contexte

Le projet est dans `/home/developer/artisan-mvp-temp`.

Plusieurs agents Claude Code travaillent en parallèle, chacun sur son propre domaine. On veut un setup où :
- Chaque agent code sur **sa branche dans son propre worktree git isolé**
- Chaque worktree est **self-contained** : process, ports, instance Puppeteer/Playwright, DB de test propres — sans perturber les autres agents
- Un **agent central de merge** récolte le travail prêt via un cron (toutes les 5 min), vérifie la mergeabilité, merge sur la branche principale, déploie sur staging, et notifie

La communication inter-agents existe déjà : voir `docs/architecture/ope-185-inter-agent-communication.md` et la section "Communication inter-agents" de `CLAUDE.md` (bus de messages `~/.agent-bus/`, scripts `devtools/agents/notify.sh`, `listen.sh`, `agents-status.sh`). Réutilise ce bus pour la signalisation (`TASK_DONE`, `REQUEST_REVIEW`, `BLOCKED`, `ALERT`).

## Étape 0 — État des lieux

Avant de proposer quoi que ce soit, comprends l'existant :
- Stack technique du projet (package manager : npm/pnpm/yarn ? framework ? DB ? regarde `package.json`, `docker-compose*.yml`, `.env*`, scripts de test)
- Comment les tests tournent aujourd'hui (e2e existants ? Puppeteer/Playwright déjà présent ?)
- Comment staging est déployé aujourd'hui (regarde `terraform/`, scripts de deploy, CI/CD `.github/`)
- Le bus d'agents existant dans `devtools/agents/`

Documente ce que tu trouves. Sois honnête sur ce qui n'existe pas.

## Étape 1 — Isolation des worktrees

Conçois la stratégie d'isolation :
- Un worktree par agent/feature (`git worktree add ../wt-<agent> <branch>`)
- Dépendances : node_modules par worktree vs store partagé (pnpm) — recommande selon le package manager réel du projet
- `.env` et variables d'environnement isolés par worktree
- **Allocation dynamique de ports** : conçois un mécanisme qui attribue à chaque worktree une plage de ports unique sans collision (offset déterministe basé sur un hash du nom, ou allocation depuis un pool avec lock)
- Règles de non-interférence (ownership par domaine — réutilise la logique Agentic Factory)

## Étape 2 — Environnements e2e isolés

Conçois l'isolation des tests e2e :
- Chaque worktree lance sa propre instance Puppeteer/Playwright (port de debug unique, profil/userDataDir isolé)
- Chaque worktree a sa propre DB de test (container éphémère OU base nommée par worktree OU schéma isolé — recommande selon la DB réelle)
- Services dépendants isolés (redis, mailcatcher, etc. selon ce qui existe)
- **Docker Compose de dev** : crée un `docker-compose.dev.yml` paramétrable par worktree via `COMPOSE_PROJECT_NAME` + offsets de port, pour que `docker compose -p wt-<agent> up` lance une stack totalement isolée
- Nettoyage automatique (teardown des containers/volumes après les tests, pas de fuite)

## Étape 3 — Agent central de merge + déploiement continu

Conçois et implémente l'agent de merge :
- **Cron toutes les 5 min** qui :
  1. Liste les branches prêtes (signalées via le bus `TASK_DONE`/`REQUEST_REVIEW`, ou un label Linear, ou un fichier de signal — recommande le plus robuste)
  2. Vérifie la mergeabilité : tests verts, pas de conflit, review/QA OK — **gating strict, rien ne merge sans tests verts**
  3. Merge sur la branche principale (détermine `main` vs `staging` selon le flux git réel du projet)
  4. Déploie sur staging (réutilise le mécanisme de deploy existant)
  5. Notifie l'agent d'origine (`TASK_DONE`) et l'humain en cas d'échec (`ALERT`/`BLOCKED`)
- Gestion des conflits : si conflit, renvoie à l'agent d'origine via `BLOCKED` (ne tente pas de résoudre à l'aveugle)
- Sérialisation des merges (un seul merge à la fois, lock) pour éviter les courses
- Pas de downtime sur staging pendant les déploiements

## Étape 4 — Cycle de dev parallèle complet

Documente le cycle de bout en bout :
- Démarrage d'une tâche : création worktree + branche depuis le dernier `main`/`staging`
- Dev + test en isolation
- Signalisation "prêt"
- Intégration par l'agent central
- Synchro régulière avec la branche principale (rebase/merge pour limiter les conflits)
- Récupération après échec (rollback, re-tentative)

## Livrables

1. **Document** `docs/architecture/dev-parallele-worktrees-merge.md` :
   - État des lieux
   - Comparatif des options techniques (avec recommandation argumentée pour chaque choix)
   - Description de l'agent de merge (cron, gating, gestion conflits)
   - Cycle de dev parallèle complet
   - Plan de mise en œuvre par phases
   - Questions ouvertes / décisions humaines requises

2. **PoC fonctionnel** : démontre 2 worktrees qui tournent leurs e2e en parallèle sans collision de ports/DB/navigateur, + l'agent de merge qui intègre l'un d'eux. Documente les commandes exactes pour reproduire.

3. **Fichiers** :
   - `docker-compose.dev.yml`
   - Script(s) d'allocation de ports (`devtools/agents/alloc-ports.sh` ou équivalent)
   - Script de création de worktree d'agent (`devtools/agents/new-worktree.sh`)
   - Script de l'agent de merge (`devtools/agents/merge-agent.sh`) + entrée cron (documentée, pas installée sans validation)
   - Scripts de teardown/nettoyage

4. **Skill** : crée `.claude/skills/agent-worktree.md` (ou mets à jour un skill existant) avec la procédure pour qu'un agent démarre, teste et signale son worktree. Référence-le depuis `CLAUDE.md` (garde CLAUDE.md court).

## Contraintes

- Pas de downtime sur staging
- Rien ne merge sans tests verts (gating strict)
- Les environnements e2e ne se perturbent jamais (ports/DB/navigateurs isolés)
- Nettoyage systématique (pas de containers/worktrees orphelins)
- N'installe PAS le cron ni ne lance de merge réel sans validation humaine — fournis tout prêt à activer, mais laisse l'activation à l'humain.

## Fin de mission

Poste un commentaire sur l'issue OPE-241 dans Linear avec le résumé de la recommandation et le lien vers le document. Sois honnête sur les risques et les points qui nécessitent une décision humaine.
