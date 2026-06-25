#!/usr/bin/env bash
#
# launch-claude-bg.sh — Launch a detached, remote-controlled Claude Code session
# inside a `screen` so it survives the parent shell.
#
# Usage:
#   ./scripts/launch-claude-bg.sh <session-name> [model] [--worktree]
#
#   <session-name>  screen session + Claude --remote-control name (required)
#   [model]         Claude model id (default: claude-sonnet-4-6)
#   [--worktree]    create an isolated git worktree at /tmp/wt-<name> on branch
#                   feat/<name>; appends scripts/prompts/_worktree-footer.md to
#                   the init prompt; the reviewer session merges and cleans up.
#
# Env:
#   INIT_PROMPT     path to a file whose contents are sent as the initial prompt
#                   (optional; plain interactive session if unset)
#
# Examples:
#   ./scripts/launch-claude-bg.sh project-manager
#   ./scripts/launch-claude-bg.sh reviewer claude-opus-4-8
#   INIT_PROMPT=./scripts/prompts/pm.md ./scripts/launch-claude-bg.sh pm
#   INIT_PROMPT=./scripts/prompts/fix-bug.md ./scripts/launch-claude-bg.sh fix-bug --worktree
#   INIT_PROMPT=./scripts/prompts/fix-bug.md ./scripts/launch-claude-bg.sh fix-bug opus --worktree
#
set -euo pipefail

MAIN_REPO="/home/developer/artisan-mvp-temp"
CLAUDE_BIN="$(command -v claude || echo "$HOME/.local/bin/claude")"
DEFAULT_MODEL="claude-sonnet-4-6"

SESSION_NAME="${1:-}"
shift || true

# Parse remaining positional + flag args: [model] [--worktree] (order-independent).
MODEL="$DEFAULT_MODEL"
USE_WORKTREE=false
for arg in "$@"; do
  case "$arg" in
    --worktree) USE_WORKTREE=true ;;
    *) MODEL="$arg" ;;
  esac
done

WORKDIR="$MAIN_REPO"

if [[ -z "$SESSION_NAME" ]]; then
  echo "ERROR: session name required." >&2
  echo "Usage: $0 <session-name> [model] [--worktree]" >&2
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
WORKTREE_PATH=""
if $USE_WORKTREE; then
  BRANCH="feat/${SESSION_NAME}"
  WORKTREE_PATH="/tmp/wt-${SESSION_NAME}"

  if [[ -d "$WORKTREE_PATH" ]]; then
    echo "ERROR: worktree path already exists: $WORKTREE_PATH" >&2
    echo "Remove it first: git -C '$MAIN_REPO' worktree remove '$WORKTREE_PATH' --force" >&2
    exit 1
  fi

  echo "Creating worktree at ${WORKTREE_PATH} on branch ${BRANCH}..."
  git -C "$MAIN_REPO" worktree add "$WORKTREE_PATH" -b "$BRANCH" \
    || { echo "ERROR: git worktree add failed." >&2; exit 1; }

  WORKDIR="$WORKTREE_PATH"
fi

# --- Build init prompt -------------------------------------------------------
export CLAUDE_INIT_PROMPT=""

if [[ -n "${INIT_PROMPT:-}" ]]; then
  if [[ ! -f "$INIT_PROMPT" ]]; then
    echo "ERROR: INIT_PROMPT file not found: $INIT_PROMPT" >&2
    exit 1
  fi
  CLAUDE_INIT_PROMPT="$(cat "$INIT_PROMPT")"
fi

if $USE_WORKTREE; then
  FOOTER_FILE="$MAIN_REPO/scripts/prompts/_worktree-footer.md"
  if [[ -f "$FOOTER_FILE" ]]; then
    FOOTER="$(cat "$FOOTER_FILE")"
    # Inject runtime values the footer references.
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
    echo "WARN: _worktree-footer.md not found at $FOOTER_FILE — no PR protocol injected." >&2
  fi
fi

# --- Launch ------------------------------------------------------------------
CMD=("$CLAUDE_BIN" --model "$MODEL" --permission-mode auto \
     --dangerously-skip-permissions --remote-control "$SESSION_NAME")

QUOTED_CMD=$(printf '%q ' "${CMD[@]}")

if $USE_WORKTREE; then
  echo "Launching Claude session '${SESSION_NAME}' (model: ${MODEL}) in worktree ${WORKTREE_PATH}..."
else
  echo "Launching Claude session '${SESSION_NAME}' (model: ${MODEL}) in ${WORKDIR}..."
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
    echo "Worktree:  $WORKTREE_PATH  (branch: feat/${SESSION_NAME})"
    echo "Cleanup:   git -C '$MAIN_REPO' worktree remove '$WORKTREE_PATH' --force"
  fi
else
  echo "ERROR: session '${SESSION_NAME}' failed to start." >&2
  if $USE_WORKTREE && [[ -d "$WORKTREE_PATH" ]]; then
    git -C "$MAIN_REPO" worktree remove "$WORKTREE_PATH" --force 2>/dev/null || true
  fi
  exit 1
fi
