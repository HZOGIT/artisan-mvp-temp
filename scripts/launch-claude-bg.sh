#!/usr/bin/env bash
#
# launch-claude-bg.sh — Launch a detached, remote-controlled Claude Code session
# inside a `screen` so it survives the parent shell.
#
# Usage:
#   ./scripts/launch-claude-bg.sh <session-name> [model]
#
#   <session-name>  screen session + Claude --remote-control name (required)
#   [model]         Claude model id (default: claude-sonnet-4-6)
#
# Env:
#   INIT_PROMPT     path to a file whose contents are sent as the initial prompt
#                   (optional; plain interactive session if unset)
#
# Examples:
#   ./scripts/launch-claude-bg.sh project-manager
#   ./scripts/launch-claude-bg.sh reviewer claude-opus-4-8
#   INIT_PROMPT=./prompts/pm.md ./scripts/launch-claude-bg.sh project-manager
#
set -euo pipefail

WORKDIR="/home/developer/artisan-mvp-temp"
CLAUDE_BIN="$(command -v claude || echo "$HOME/.local/bin/claude")"
DEFAULT_MODEL="claude-sonnet-4-6"

SESSION_NAME="${1:-}"
MODEL="${2:-$DEFAULT_MODEL}"

if [[ -z "$SESSION_NAME" ]]; then
  echo "ERROR: session name required." >&2
  echo "Usage: $0 <session-name> [model]" >&2
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

# Refuse to start a duplicate session with the same name.
if screen -ls 2>/dev/null | grep -qE "[0-9]+\.${SESSION_NAME}[[:space:]]"; then
  echo "ERROR: a screen session named '${SESSION_NAME}' already exists." >&2
  echo "Attach with: screen -r ${SESSION_NAME}" >&2
  exit 1
fi

CMD=("$CLAUDE_BIN" --model "$MODEL" --permission-mode auto \
     --dangerously-skip-permissions --remote-control "$SESSION_NAME")

# Build a properly-quoted command string so spaces/newlines in the prompt
# are not word-split by the bash -c subshell.
QUOTED_CMD=$(printf '%q ' "${CMD[@]}")

if [[ -n "${INIT_PROMPT:-}" ]]; then
  if [[ ! -f "$INIT_PROMPT" ]]; then
    echo "ERROR: INIT_PROMPT file not found: $INIT_PROMPT" >&2
    exit 1
  fi
  # Export prompt content so the subshell can reference it via $CLAUDE_INIT_PROMPT
  # without the outer shell word-splitting its value into the bash -c string.
  export CLAUDE_INIT_PROMPT
  CLAUDE_INIT_PROMPT="$(cat "$INIT_PROMPT")"
fi

echo "Launching Claude session '${SESSION_NAME}' (model: ${MODEL}) in ${WORKDIR}..."
if [[ -n "${INIT_PROMPT:-}" ]]; then
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
else
  echo "ERROR: session '${SESSION_NAME}' failed to start." >&2
  exit 1
fi
