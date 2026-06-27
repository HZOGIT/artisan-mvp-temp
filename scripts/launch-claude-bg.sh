#!/usr/bin/env bash
#
# launch-claude-bg.sh — Launch a detached, remote-controlled Claude Code session
# inside a `screen` so it survives the parent shell.
#
# Usage:
#   ./scripts/launch-claude-bg.sh <session-name> [model] [--worktree]
#
#   <session-name>  screen session + Claude --remote-control name (required)
#   [model]         haiku | sonnet (default) | opus  — or a full model ID
#   [--worktree]    create an isolated git worktree at /tmp/wt-<name> on branch
#                   feat/<name>; appends the worktree PR protocol to the prompt;
#                   the reviewer session merges and cleans up.
#
# Env (mutually exclusive — pick one):
#   LINEAR_ISSUE=OPE-XXX   task plan lives in a Linear comment; bootstrap prompt
#                           is generated inline (no .md file needed).
#   INIT_PROMPT=<path>     path to a .md file (for infra sessions: reviewer, etc.)
#
# Model aliases:
#   haiku   → claude-haiku-4-5-20251001   (simple fixes, research, formatting)
#   sonnet  → claude-sonnet-4-6           (default — most tasks)
#   opus    → claude-opus-4-8             (reviewer, complex architecture)
#
# Examples:
#   # Task driven by a Linear issue (plan in a comment on OPE-487):
#   LINEAR_ISSUE=OPE-487 ./scripts/launch-claude-bg.sh fix-pdf haiku
#   LINEAR_ISSUE=OPE-540 ./scripts/launch-claude-bg.sh impl-tva sonnet --worktree
#
#   # Infrastructure session (reviewer — plan in a local file):
#   INIT_PROMPT=./scripts/prompts/reviewer-agent.md \
#     ./scripts/launch-claude-bg.sh reviewer opus
#
set -euo pipefail

MAIN_REPO="/home/developer/artisan-mvp-temp"
CLAUDE_BIN="$(command -v claude || echo "$HOME/.local/bin/claude")"

SESSION_NAME="${1:-}"
shift || true

# Parse remaining args: [model] [--worktree] (order-independent).
RAW_MODEL="sonnet"
USE_WORKTREE=false
for arg in "$@"; do
  case "$arg" in
    --worktree) USE_WORKTREE=true ;;
    *) RAW_MODEL="$arg" ;;
  esac
done

# Resolve model aliases.
case "$RAW_MODEL" in
  haiku)  MODEL="claude-haiku-4-5-20251001" ;;
  sonnet) MODEL="claude-sonnet-4-6" ;;
  opus)   MODEL="claude-opus-4-8" ;;
  *)      MODEL="$RAW_MODEL" ;;
esac

WORKDIR="$MAIN_REPO"

if [[ -z "$SESSION_NAME" ]]; then
  echo "ERROR: session name required." >&2
  echo "Usage: $0 <session-name> [haiku|sonnet|opus] [--worktree]" >&2
  exit 1
fi

if [[ -n "${LINEAR_ISSUE:-}" && -n "${INIT_PROMPT:-}" ]]; then
  echo "ERROR: LINEAR_ISSUE and INIT_PROMPT are mutually exclusive." >&2
  exit 1
fi

if ! command -v screen >/dev/null 2>&1; then
  echo "ERROR: 'screen' is not installed." >&2
  exit 1
fi

if [[ ! -x "$CLAUDE_BIN" ]]; then
  echo "ERROR: claude CLI not found (looked for: $CLAUDE_BIN)." >&2
  exit 1
fi

if screen -ls 2>/dev/null | grep -qE "[0-9]+\.${SESSION_NAME}[[:space:]]"; then
  echo "ERROR: a screen session named '${SESSION_NAME}' already exists." >&2
  echo "Attach with: screen -r ${SESSION_NAME}" >&2
  exit 1
fi

# --- Worktree setup ----------------------------------------------------------
if $USE_WORKTREE; then
  WORKTREE_PATH="/tmp/wt-${SESSION_NAME}"

  if [[ -d "$WORKTREE_PATH" ]]; then
    echo "ERROR: worktree path already exists: $WORKTREE_PATH" >&2
    echo "Remove it first: git -C '$MAIN_REPO' worktree remove '$WORKTREE_PATH' --force" >&2
    exit 1
  fi

  echo "Fetching origin/staging before worktree creation..."
  git -C "$MAIN_REPO" fetch origin staging \
    || { echo "WARNING: git fetch failed, using local HEAD." >&2; }

  echo "Creating worktree at ${WORKTREE_PATH} on branch feat/${SESSION_NAME} from origin/staging..."
  git -C "$MAIN_REPO" worktree add "$WORKTREE_PATH" -b "feat/${SESSION_NAME}" origin/staging \
    || { echo "ERROR: git worktree add failed." >&2; exit 1; }

  WORKDIR="$WORKTREE_PATH"
fi

# --- Build init prompt -------------------------------------------------------
export CLAUDE_INIT_PROMPT=""

if [[ -n "${LINEAR_ISSUE:-}" ]]; then
  # Bootstrap inline — no .md file. The session reads its full plan from Linear.

  if $USE_WORKTREE; then
    WORKTREE_NOTICE="
WORKTREE ISOLE : tu travailles dans /tmp/wt-${SESSION_NAME} (branche feat/${SESSION_NAME}).
JAMAIS dans ${MAIN_REPO} pour editer des fichiers.
Tous tes Edit/Write/Read utilisent des chemins absolus sous /tmp/wt-${SESSION_NAME}/...
Le repo principal ${MAIN_REPO} sert UNIQUEMENT a lancer pnpm (node_modules).
Lance d'abord : git -C /tmp/wt-${SESSION_NAME} branch --show-current  -> doit afficher feat/${SESSION_NAME}
"
  else
    WORKTREE_NOTICE=""
  fi

  CLAUDE_INIT_PROMPT="Tu es l'agent **${SESSION_NAME}** sur le projet Operioz.
${WORKTREE_NOTICE}
Ton plan détaillé se trouve dans les commentaires de l'issue Linear **${LINEAR_ISSUE}**.
Commence par le lire :
  mcp__plugin_linear_linear__get_issue({ id: \"${LINEAR_ISSUE}\" })
  mcp__plugin_linear_linear__list_comments({ issueId: \"${LINEAR_ISSUE}\" })

Exécute le plan dans l'ordre indiqué dans le commentaire. Si plusieurs commentaires existent, le plan est dans le plus récent marqué comme plan / instructions."

elif [[ -n "${INIT_PROMPT:-}" ]]; then
  if [[ ! -f "$INIT_PROMPT" ]]; then
    echo "ERROR: INIT_PROMPT file not found: $INIT_PROMPT" >&2
    exit 1
  fi
  CLAUDE_INIT_PROMPT="$(cat "$INIT_PROMPT")"
fi

# Append worktree PR protocol (file-based — infrastructure, not task-specific).
if $USE_WORKTREE; then
  FOOTER_FILE="$MAIN_REPO/scripts/prompts/_worktree-footer.md"
  if [[ -f "$FOOTER_FILE" ]]; then
    FOOTER="$(cat "$FOOTER_FILE")"
    FOOTER="${FOOTER//__SESSION_NAME__/$SESSION_NAME}"
    FOOTER="${FOOTER//__MAIN_REPO__/$MAIN_REPO}"
    FOOTER="${FOOTER//__BRANCH__/feat\/$SESSION_NAME}"
    if [[ -n "$CLAUDE_INIT_PROMPT" ]]; then
      CLAUDE_INIT_PROMPT="${CLAUDE_INIT_PROMPT}

---

${FOOTER}"
    else
      CLAUDE_INIT_PROMPT="$FOOTER"
    fi
  else
    echo "WARN: _worktree-footer.md not found — no PR protocol injected." >&2
  fi
fi

# --- Launch ------------------------------------------------------------------
CMD=("$CLAUDE_BIN" --model "$MODEL" --permission-mode auto \
     --dangerously-skip-permissions --remote-control "$SESSION_NAME")

QUOTED_CMD=$(printf '%q ' "${CMD[@]}")

if $USE_WORKTREE; then
  echo "Launching '${SESSION_NAME}' (${RAW_MODEL} → ${MODEL}) in worktree /tmp/wt-${SESSION_NAME}..."
else
  echo "Launching '${SESSION_NAME}' (${RAW_MODEL} → ${MODEL}) in ${WORKDIR}..."
fi

if [[ -n "$CLAUDE_INIT_PROMPT" ]]; then
  screen -dmS "$SESSION_NAME" bash -c "cd '$WORKDIR' && exec $QUOTED_CMD \"\$CLAUDE_INIT_PROMPT\""
else
  screen -dmS "$SESSION_NAME" bash -c "cd '$WORKDIR' && exec $QUOTED_CMD"
fi

sleep 1
if screen -ls 2>/dev/null | grep -qE "[0-9]+\.${SESSION_NAME}[[:space:]]"; then
  echo "OK — session '${SESSION_NAME}' is running."
  echo "Attach:  screen -r ${SESSION_NAME}"
  echo "Detach:  Ctrl-a d"
  echo "Kill:    screen -S ${SESSION_NAME} -X quit"
  if $USE_WORKTREE; then
    echo "Worktree: /tmp/wt-${SESSION_NAME}  (branch: feat/${SESSION_NAME})"
  fi
else
  echo "ERROR: session '${SESSION_NAME}' failed to start." >&2
  if $USE_WORKTREE && [[ -d "/tmp/wt-${SESSION_NAME}" ]]; then
    git -C "$MAIN_REPO" worktree remove "/tmp/wt-${SESSION_NAME}" --force 2>/dev/null || true
  fi
  exit 1
fi
