#!/usr/bin/env bash
#
# slot-watcher.sh — watch feat/* slot count and notify PM on release.
#
# On every 30-second tick it calls slot-count.sh. When the count DECREASES
# (a slot freed), it sends SLOT_FREE to project-manager. Anti-spam: notifies
# only on change (not every tick).
#
# Robust: the inner loop never exits on partial failures (|| true everywhere).
# Race-safe: relies on slot-count.sh UNION logic (PR still open = still counts
# even if worktree is being cleaned; dead screen without worktree = doesn't count).
#
# Usage:
#   ./scripts/agents/slot-watcher.sh start    # launch loop in screen slot-watcher (idempotent)
#   ./scripts/agents/slot-watcher.sh stop     # kill the screen session
#   ./scripts/agents/slot-watcher.sh status   # running | stopped
#   ./scripts/agents/slot-watcher.sh test     # self-check (no framework, no external side-effects)
#
# Env:
#   SLOT_CAP         capacity ceiling (default: 4, must match slot-count.sh)
#   AGENT_BUS_DIR    bus root (default: ~/.agent-bus)
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUS_DIR="${AGENT_BUS_DIR:-$HOME/.agent-bus}"
STATE_FILE="$BUS_DIR/slot-watcher.state"
SLOT_CAP="${SLOT_CAP:-4}"

_tick() {
  local active prev libres
  active="$("$HERE/slot-count.sh" 2>/dev/null || echo "")"
  [[ "$active" =~ ^[0-9]+$ ]] || return 0

  prev="$(cat "$STATE_FILE" 2>/dev/null || echo "")"
  echo "$active" >"$STATE_FILE"

  [[ "$prev" =~ ^[0-9]+$ ]] || return 0  # first tick: no previous state, skip
  [[ "$active" -lt "$prev" ]] || return 0  # no decrease → no notification

  libres=$(( SLOT_CAP - active ))
  [[ "$libres" -lt 0 ]] && libres=0
  "$HERE/notify.sh" project-manager SLOT_FREE \
    "${active}/${SLOT_CAP} — ${libres} libre(s)" || true
}

_loop() {
  mkdir -p "$BUS_DIR"
  while true; do
    _tick || true
    sleep 30
  done
}

case "${1:-}" in
  start)
    if screen -ls 2>/dev/null | grep -qE "[0-9]+\\.slot-watcher[[:space:]]"; then
      echo "slot-watcher already running" >&2
      exit 0
    fi
    SELF="$(realpath "${BASH_SOURCE[0]}")"
    screen -dmS slot-watcher bash "$SELF" _loop
    echo "slot-watcher started"
    ;;
  stop)
    screen -S slot-watcher -X quit 2>/dev/null || true
    echo "slot-watcher stopped"
    ;;
  status)
    if screen -ls 2>/dev/null | grep -qE "[0-9]+\\.slot-watcher[[:space:]]"; then
      echo "running"
    else
      echo "stopped"
    fi
    ;;
  _loop)
    _loop
    ;;
  test)
    echo "=== slot-watcher self-check ==="
    local_fail=0

    # Test 1: slot-count returns a valid integer
    count="$("$HERE/slot-count.sh" 2>/dev/null || echo "")"
    if [[ "$count" =~ ^[0-9]+$ ]]; then
      echo "OK  slot-count = $count (valid integer)"
    else
      echo "FAIL slot-count returned '${count:-<empty>}'" >&2
      local_fail=1
    fi

    # Test 2: transition detection (prev > current → notify)
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    echo $(( ${count:-0} + 2 )) >"$tmp"
    prev_val="$(cat "$tmp")"
    if [[ "${count:-0}" -lt "$prev_val" ]]; then
      libres=$(( SLOT_CAP - ${count:-0} ))
      [[ "$libres" -lt 0 ]] && libres=0
      echo "OK  transition detected (prev=$prev_val current=${count:-0}) → would send SLOT_FREE ${count:-0}/${SLOT_CAP} — ${libres} libre(s)"
    else
      echo "FAIL transition logic broken (prev=$prev_val current=${count:-0})" >&2
      local_fail=1
    fi

    # Test 3: no notification when count stays the same
    echo "${count:-0}" >"$tmp"
    prev_same="$(cat "$tmp")"
    if [[ "${count:-0}" -lt "$prev_same" ]]; then
      echo "FAIL spurious notification when count unchanged" >&2
      local_fail=1
    else
      echo "OK  no notification when count unchanged (prev=${prev_same} current=${count:-0})"
    fi

    [[ "$local_fail" -eq 0 ]] && echo "=== all tests passed ===" || { echo "=== FAILED ===" >&2; exit 1; }
    ;;
  *)
    echo "Usage: $0 start|stop|status|test" >&2
    exit 2
    ;;
esac
