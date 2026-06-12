# CLAUDE.md — Operioz

Instructions et conventions pour les agents Claude Code travaillant sur ce projet.

---

## Lancer une session agent en arrière-plan

Le script `devtools/launch-claude-bg.sh` démarre une session Claude Code dans un `screen` détaché, avec remote-control activé et permissions auto.

### Commande

```bash
INIT_PROMPT=./devtools/prompts/<prompt-file>.md \
  ./devtools/launch-claude-bg.sh <session-name> [model]
```

### Paramètres

| Paramètre | Description | Défaut |
|---|---|---|
| `<session-name>` | Nom de la session screen et du remote-control (requis) | — |
| `[model]` | ID ou alias du modèle Claude | `claude-sonnet-4-6` |
| `INIT_PROMPT` | Chemin vers le fichier prompt d'initialisation (optionnel) | — |

### Exemples

```bash
# Session simple sans prompt initial
./devtools/launch-claude-bg.sh mon-agent

# Session avec prompt initial, modèle Opus
INIT_PROMPT=./devtools/prompts/ope-185-inter-agent-comm.md \
  ./devtools/launch-claude-bg.sh ope-185-inter-agent-comm claude-opus-4-8

# Session analyse stack (OPE-184)
INIT_PROMPT=./devtools/prompts/ope-184-stack-analysis.md \
  ./devtools/launch-claude-bg.sh ope-184-stack-analysis claude-opus-4-8
```

### Gestion des sessions

```bash
# Lister les sessions actives
screen -ls

# Attacher à une session (observer / intervenir)
screen -r <session-name>

# Détacher sans tuer (depuis l'intérieur)
Ctrl-a d

# Tuer une session
screen -S <session-name> -X quit
```

### Conventions de nommage

- Sessions liées à une issue Linear : `ope-<numéro>-<slug-court>` (ex: `ope-185-inter-agent-comm`)
- Sessions thématiques : `<domaine>-<action>` (ex: `agentic-factory-etat-des-lieux`)

### Prompts d'initialisation

Les prompts sont stockés dans `devtools/prompts/`. Chaque fichier décrit la mission complète de la session : contexte, étapes, livrables attendus.

Un prompt bien écrit doit être **auto-suffisant** : la session peut accomplir sa mission sans intervention humaine et sans accès à la conversation qui l'a lancée.

---

## Modèles disponibles

| Alias | Model ID | Usage recommandé |
|---|---|---|
| `sonnet` | `claude-sonnet-4-6` | Tâches courantes, iteration rapide |
| `opus` | `claude-opus-4-8` | Analyse complexe, architecture, exploration |
| `haiku` | `claude-haiku-4-5-20251001` | Tâches simples, scripts, formatage |

---

## Structure du projet

```
devtools/
  launch-claude-bg.sh     # Lance une session agent en arrière-plan
  prompts/                # Prompts d'initialisation des sessions agents
docs/
  architecture/           # Documents d'analyse et propositions techniques
  audits/                 # Rapports d'audit de la codebase
```
