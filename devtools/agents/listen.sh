#!/usr/bin/env bash
#
# listen.sh — read messages addressed to an agent.
#
# Usage:
#   ./devtools/agents/listen.sh <agent> [mode]
#
#   <agent>   the inbox to read (= this agent's name)
#
# Modes:
#   --drain   (default for a wake nudge) print all pending messages and archive
#             them, then exit. Non-blocking. This is what an agent runs when it
#             is poked by notify.sh.
#   --once    block (poll) until at least one message arrives, drain it, exit.
#   --follow  block forever, printing + archiving each new message as it lands.
#             Intended for wrapper scripts / the PoC, not interactive Claude.
#   --peek    print pending messages WITHOUT archiving them (read-only).
#
# Output: each message is printed as its raw JSON line (machine-parseable),
# preceded by a one-line human summary comment.
#
# Env: AGENT_BUS_DIR (default ~/.agent-bus), AGENT_BUS_POLL_SECS (default 1)
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_bus_common.sh
source "$HERE/_bus_common.sh"

AGENT="${1:-}"
MODE="${2:---drain}"
POLL="${AGENT_BUS_POLL_SECS:-1}"

if [[ -z "$AGENT" ]]; then
  echo "Usage: $0 <agent> [--drain|--once|--follow|--peek]" >&2
  exit 2
fi

bus_init_dirs
INBOX="$BUS_INBOX/$AGENT"
ARCHIVE="$BUS_PROCESSED/$AGENT"
mkdir -p "$INBOX" "$ARCHIVE"

# Print (and optionally archive) every *.json currently in the inbox, oldest
# first. Returns 0 if it printed at least one message, 1 otherwise.
drain_inbox() {
  local archive_after="$1" found=1 f
  shopt -s nullglob
  for f in $(printf '%s\n' "$INBOX"/*.json | sort); do
    [[ -e "$f" ]] || continue
    found=0
    bus_fmt "$f"          # human summary (commented with leading spaces)
    cat "$f"              # raw JSON line (parseable)
    if [[ "$archive_after" -eq 1 ]]; then
      mv -f "$f" "$ARCHIVE/"
    fi
  done
  shopt -u nullglob
  return $found
}

case "$MODE" in
  --peek)
    drain_inbox 0 || echo "(inbox empty)"
    ;;
  --drain)
    drain_inbox 1 || echo "(inbox empty)"
    ;;
  --once)
    until drain_inbox 1; do sleep "$POLL"; done
    ;;
  --follow)
    echo "# listening on inbox '$AGENT' (Ctrl-C to stop)…" >&2
    while true; do
      drain_inbox 1 || true
      sleep "$POLL"
    done
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    exit 2
    ;;
esac
