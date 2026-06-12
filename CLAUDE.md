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
