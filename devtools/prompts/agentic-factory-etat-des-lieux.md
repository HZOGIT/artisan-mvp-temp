Tu es un architecte senior en systèmes multi-agents. Ta mission est de faire un état des lieux complet de ce qui existe déjà dans le projet Operioz en matière d'agents de code autonomes, puis de produire une proposition pour mettre en place une "Agentic Factory" robuste et scalable.

## Contexte

Le projet est dans `/home/developer/artisan-mvp-temp`.

On veut mettre en place un système d'agents de code autonomes qui :
- Tournent 24/7 en arrière-plan
- Ont chacun un ownership clair sur un domaine du projet
- Communiquent entre eux (via Linear, fichiers, messages, etc.)
- Peuvent se coordonner sans intervention humaine constante
- Escaladent vers un humain uniquement quand nécessaire

## Étape 1 — État des lieux de l'existant

Explore le projet et documente ce qui existe déjà :

### Infrastructure d'agents
- Examine `devtools/` : quels scripts existent ? Comment fonctionnent-ils ?
- Y a-t-il des sessions screen existantes ? (`screen -ls`)
- Y a-t-il des cron jobs, des scheduled tasks, des boucles de fond ?
- Regarde `.claude/` (settings, hooks, agents, plugins) — qu'est-ce qui est configuré ?
- Y a-t-il des prompts d'agents existants dans `devtools/prompts/` ?

### Outillage disponible
- Quels outils MCP sont configurés ? (Linear, autres ?)
- Quels hooks Claude Code sont en place ?
- Y a-t-il des skills/commandes personnalisées ?

### Codebase
- Structure générale du projet (domaines métier identifiables)
- Taille approximative (nb de fichiers, lignes de code)
- Stack technique actuelle
- Présence de tests, CI/CD

## Étape 2 — Analyse des gaps

Sur la base de l'état des lieux, identifie ce qui manque pour avoir une vraie Agentic Factory :
- Orchestration (comment lancer/superviser les agents ?)
- Communication inter-agents (quel protocole ?)
- Ownership & périmètres (comment définir les domaines ?)
- Gestion des conflits (git worktrees ? locks ?)
- Observabilité (logs, alertes, dashboard ?)
- Escalade humaine (quand/comment ?)

## Étape 3 — Proposition d'architecture

Propose une architecture concrète pour la factory, adaptée à ce projet :
- Quels agents créer en priorité (par domaine) ?
- Comment les lancer et les superviser (screen, cron, supervisord, autre ?) ?
- Quel protocole de communication (Linear issues/comments, fichiers de lock, queues ?) ?
- Comment gérer les worktrees git pour éviter les conflits ?
- Quelle structure de dossiers pour la factory (`devtools/agents/`, `devtools/orchestrator/`, etc.) ?
- Quels mécanismes de sécurité (pas de push direct, PR obligatoire, review humaine) ?

## Livrable

Écris le document complet dans `docs/architecture/agentic-factory-etat-des-lieux.md`.

Structure suggérée :
1. Résumé exécutif
2. État des lieux (existant)
3. Gaps identifiés
4. Architecture proposée
5. Plan de mise en œuvre par phases
6. Questions ouvertes / décisions humaines requises

Le document doit être actionnable. Chaque section se termine par une liste de next steps concrets.

Sois honnête sur ce qui n'existe pas encore et sur les risques. Ne sur-promets pas.
