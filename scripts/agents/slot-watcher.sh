#!/usr/bin/env bash
#
# slot-watcher.sh — watch feat/* slot count and notify PM on release.
#
# On every 30-second tick it calls slot-count.sh. When the count DECREASES
# (a slot freed), it confirms the decrease with a second read after DEBOUNCE_DELAY
# seconds before notifying. Anti-spam: notifies only on confirmed, non-transient
# change.
#
# Debounce rationale: during git commit/rebase, git worktree list momentarily
# omits the worktree being locked, causing slot-count to return a falsely low
# count for 1-2 seconds. Without debounce this triggers spurious SLOT_FREE,
# risking over-dispatch and OOM.
#
# Usage:
#   ./scripts/agents/slot-watcher.sh start    # launch loop in screen slot-watcher (idempotent)
#   ./scripts/agents/slot-watcher.sh stop     # kill the screen session
#   ./scripts/agents/slot-watcher.sh status   # running | stopped
#   ./scripts/agents/slot-watcher.sh test     # self-check (no framework, no external side-effects)
#
# Env:
#   SLOT_CAP         capacity ceiling (default: 4, must match slot-count.sh)
#   DEBOUNCE_DELAY   seconds between the two confirmation reads (default: 2)
#   AGENT_BUS_DIR    bus root (default: ~/.agent-bus)
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUS_DIR="${AGENT_BUS_DIR:-$HOME/.agent-bus}"
STATE_FILE="$BUS_DIR/slot-watcher.state"
SLOT_CAP="${SLOT_CAP:-4}"
DEBOUNCE_DELAY="${DEBOUNCE_DELAY:-2}"

_tick() {
  local active prev libres active2
  active="$("$HERE/slot-count.sh" 2>/dev/null || echo "")"
  [[ "$active" =~ ^[0-9]+$ ]] || return 0

  prev="$(cat "$STATE_FILE" 2>/dev/null || echo "")"

  if [[ ! "$prev" =~ ^[0-9]+$ ]]; then
    echo "$active" >"$STATE_FILE"
    return 0
  fi

  if [[ "$active" -ge "$prev" ]]; then
    echo "$active" >"$STATE_FILE"
    return 0
  fi

  # Potential decrease — confirm after debounce to filter git lock transients
  sleep "$DEBOUNCE_DELAY"
  active2="$("$HERE/slot-count.sh" 2>/dev/null || echo "")"
  [[ "$active2" =~ ^[0-9]+$ ]] || return 0

  if [[ "$active2" -ge "$prev" ]]; then
    # Transient glitch (e.g. git worktree locked during commit/rebase) — ignore
    echo "$active2" >"$STATE_FILE"
    return 0
  fi

  # Confirmed decrease — emit SLOT_FREE
  echo "$active2" >"$STATE_FILE"
  libres=$(( SLOT_CAP - active2 ))
  [[ "$libres" -lt 0 ]] && libres=0
  "$HERE/notify.sh" project-manager SLOT_FREE \
    "${active2}/${SLOT_CAP} — ${libres} libre(s)" || true
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
    # ponytail: daemon must survive worktree cleanup — re-exec from persistent repo
    if [[ "$SELF" == /tmp/wt-* ]]; then
      exec bash "/home/developer/artisan-mvp-temp/scripts/agents/slot-watcher.sh" start
    fi
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

    tmpdir="$(mktemp -d)"
    tmpstate="$(mktemp)"
    trap 'rm -rf "$tmpdir" "$tmpstate"' EXIT

    # Mock notify.sh — appends "<type> <payload>" to notify.log
    export MOCK_NOTIFY_LOG="$tmpdir/notify.log"
    cat >"$tmpdir/notify.sh" <<'NOTIFY_MOCK'
#!/usr/bin/env bash
echo "$2 $3" >>"$MOCK_NOTIFY_LOG"
NOTIFY_MOCK
    chmod +x "$tmpdir/notify.sh"

    # Helper: create slot-count.sh that pops values from a space-separated queue file
    _make_slot_count() {
      local queue_file="$1"
      cat >"$tmpdir/slot-count.sh" <<SCRIPT
#!/usr/bin/env bash
vals=(\$(cat "$queue_file" 2>/dev/null || true))
echo "\${vals[0]:-0}"
printf '%s\n' "\${vals[@]:1}" >"$queue_file"
SCRIPT
      chmod +x "$tmpdir/slot-count.sh"
    }

    # Test 1: slot-count returns a valid integer
    count="$("$HERE/slot-count.sh" 2>/dev/null || echo "")"
    if [[ "$count" =~ ^[0-9]+$ ]]; then
      echo "OK  slot-count = $count (valid integer)"
    else
      echo "FAIL slot-count returned '${count:-<empty>}'" >&2
      local_fail=1
    fi

    # Test 2: isolated low reading (transient) → no SLOT_FREE
    qf="$(mktemp)"
    echo "3 4" >"$qf"        # first call: 3 (dip), second call: 4 (restored)
    _make_slot_count "$qf"
    echo "4" >"$tmpstate"    # prev = 4
    rm -f "$MOCK_NOTIFY_LOG"
    (
      HERE="$tmpdir"
      STATE_FILE="$tmpstate"
      DEBOUNCE_DELAY=0
      _tick
    )
    if [[ ! -s "$MOCK_NOTIFY_LOG" ]]; then
      echo "OK  transient decrease ignored — no SLOT_FREE"
    else
      echo "FAIL spurious SLOT_FREE on transient dip: $(cat "$MOCK_NOTIFY_LOG")" >&2
      local_fail=1
    fi
    rm -f "$qf"

    # Test 3: persistent decrease → SLOT_FREE emitted once
    qf="$(mktemp)"
    echo "3 3" >"$qf"        # both calls return 3 (real release)
    _make_slot_count "$qf"
    echo "4" >"$tmpstate"    # prev = 4
    rm -f "$MOCK_NOTIFY_LOG"
    (
      HERE="$tmpdir"
      STATE_FILE="$tmpstate"
      DEBOUNCE_DELAY=0
      _tick
    )
    if [[ -f "$MOCK_NOTIFY_LOG" ]] && grep -q "SLOT_FREE" "$MOCK_NOTIFY_LOG"; then
      echo "OK  persistent decrease triggers SLOT_FREE: $(cat "$MOCK_NOTIFY_LOG")"
    else
      echo "FAIL no SLOT_FREE on confirmed decrease" >&2
      local_fail=1
    fi
    rm -f "$qf"

    [[ "$local_fail" -eq 0 ]] && echo "=== all tests passed ===" || { echo "=== FAILED ===" >&2; exit 1; }
    ;;
  *)
    echo "Usage: $0 start|stop|status|test" >&2
    exit 2
    ;;
esac
