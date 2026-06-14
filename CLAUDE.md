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
