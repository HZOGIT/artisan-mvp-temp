# Skill : lancer une session agent en arrière-plan

Lance `scripts/launch-claude-bg.sh` dans un `screen` détaché avec remote-control et permissions auto.

## Commande

```bash
INIT_PROMPT=./scripts/prompts/<prompt-file>.md \
  ./scripts/launch-claude-bg.sh <session-name> [model]
```

## Paramètres

| Paramètre | Description | Défaut |
|---|---|---|
| `<session-name>` | Nom screen + remote-control (requis) | — |
| `[model]` | ID ou alias du modèle | `claude-sonnet-4-6` |
| `INIT_PROMPT` | Chemin vers le prompt d'init (optionnel) | — |

## Modèles

| Alias | Model ID | Usage |
|---|---|---|
| `sonnet` | `claude-sonnet-4-6` | Tâches courantes |
| `opus` | `claude-opus-4-8` | Analyse complexe, architecture |
| `haiku` | `claude-haiku-4-5-20251001` | Scripts, tâches simples |

## Gestion des sessions

```bash
screen -ls                          # lister
screen -r <session-name>            # attacher
# Ctrl-a d                          # détacher
screen -S <session-name> -X quit    # tuer
```

## Conventions de nommage

- Issue Linear → `ope-<numéro>-<slug-court>` (ex: `ope-185-inter-agent-comm`)
- Session thématique → `<domaine>-<action>` (ex: `agentic-factory-etat-des-lieux`)

## Prompts d'init

Stockés dans `scripts/prompts/`. Chaque fichier doit être **auto-suffisant** : la session accomplit sa mission sans accès à la conversation qui l'a lancée.
