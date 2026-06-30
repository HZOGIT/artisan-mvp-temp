#!/usr/bin/env bash
#
# betterstack-forwarder.sh — Poll BetterStack Uptime for open incidents and
# forward new ones to the agent bus (→ project-manager ALERT).
#
# Deduplicates by incident ID so each outage notifies only once, regardless of
# how many polling cycles it spans.
#
# Config (runtime, NOT committed):
#   BETTERSTACK_API_KEY   BetterStack team API key:
#                         uptime.betterstack.com → Settings → API → Bearer token
#                         (different from BETTERSTACK_TOKEN, which is the Logtail
#                          source token for log ingestion)
#                         Alternative: store the key in
#                         $HOME/.config/operioz/betterstack-api-key (chmod 600)
#   BETTERSTACK_POLL_INTERVAL  seconds between polls (default: 300 = 5 min)
#
# Frontend note: Vite/browser JS errors are NOT integrated with BetterStack —
# only backend (Node/Fastify/pino) logs flow via Logtail. Uptime monitors surface
# availability incidents (backend down, heartbeat missed). For log-level alerts
# (fatal/error patterns in Logtail), configure an alert rule + webhook in the
# BetterStack dashboard pointing to a backend endpoint — this script does NOT
# poll the Logtail API.
#
# Usage:
#   ./scripts/monitoring/betterstack-forwarder.sh start    # launch in screen
#   ./scripts/monitoring/betterstack-forwarder.sh stop
#   ./scripts/monitoring/betterstack-forwarder.sh status
#   ./scripts/monitoring/betterstack-forwarder.sh tick     # single poll (debug)
#   ./scripts/monitoring/betterstack-forwarder.sh test     # self-check (no network)
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUS_DIR="${AGENT_BUS_DIR:-$HOME/.agent-bus}"
STATE_FILE="$BUS_DIR/betterstack-forwarder.state"
POLL_INTERVAL="${BETTERSTACK_POLL_INTERVAL:-300}"
UPTIME_API="https://uptime.betterstack.com/api/v2"
LOG="/tmp/betterstack-forwarder.log"

_log() { echo "[betterstack-forwarder] $*" | tee -a "$LOG" >&2; }

_api_key() {
  if [[ -n "${BETTERSTACK_API_KEY:-}" ]]; then
    printf "%s" "$BETTERSTACK_API_KEY"; return 0
  fi
  local cf="$HOME/.config/operioz/betterstack-api-key"
  if [[ -f "$cf" ]]; then cat "$cf"; return 0; fi
  return 1
}

_state_seen() {
  grep -qxF "${1:?}" "$STATE_FILE" 2>/dev/null
}

_state_mark() {
  echo "${1:?}" >> "$STATE_FILE"
  # ponytail: cap state size — keep last 500 entries
  local trimmed
  trimmed="$(tail -500 "$STATE_FILE")"
  printf "%s\n" "$trimmed" > "$STATE_FILE"
}

_parse_py='
import sys, json
data = json.load(sys.stdin)
monitors = {}
for inc in (data.get("included") or []):
    if inc.get("type") == "monitor":
        attrs = inc.get("attributes") or {}
        monitors[inc["id"]] = (
            attrs.get("pronounceable_name")
            or attrs.get("url")
            or inc["id"]
        )
for item in (data.get("data") or []):
    attrs = item.get("attributes") or {}
    iid = item.get("id", "")
    rel = ((item.get("relationships") or {}).get("monitor", {}).get("data") or {})
    mid = rel.get("id", "")
    name = monitors.get(mid) or attrs.get("name") or mid or iid
    started = attrs.get("started_at") or "N/A"
    cause = attrs.get("cause") or "N/A"
    print(f"{iid}\t{name}\t{started}\t{cause}")
'

_tick() {
  local key
  if ! key="$(_api_key)"; then
    _log "WARN: BETTERSTACK_API_KEY non configuré — skip (voir README dans scripts/monitoring/)"
    return 0
  fi

  local response
  response="$(curl -sf -m 15 \
    -H "Authorization: Bearer $key" \
    "$UPTIME_API/incidents?status=started&per_page=25&include=monitor" 2>/dev/null)" || {
    _log "WARN: API BetterStack Uptime unreachable — skip"
    return 0
  }

  local items
  items="$(echo "$response" | python3 -c "$_parse_py" 2>/dev/null)" || {
    _log "WARN: JSON parse failed"
    return 0
  }

  mkdir -p "$BUS_DIR"
  local id name started_at cause
  while IFS=$'\t' read -r id name started_at cause; do
    [[ -z "$id" ]] && continue
    if _state_seen "$id"; then continue; fi
    _state_mark "$id"
    _log "Nouvel incident détecté: ${name} — ${cause} (depuis ${started_at}) [ID:${id}]"
    "$HERE/../agents/notify.sh" project-manager ALERT \
      "BetterStack incident: ${name} — ${cause} (depuis ${started_at}) [ID:${id}]" || true
  done <<< "$items"
}

_loop() {
  mkdir -p "$BUS_DIR"
  _log "démarré (interval=${POLL_INTERVAL}s)"
  while true; do
    _tick || true
    sleep "$POLL_INTERVAL"
  done
}

case "${1:-}" in
  start)
    SELF="$(realpath "${BASH_SOURCE[0]}")"
    # ponytail: re-exec from persistent repo — daemon must survive worktree cleanup
    if [[ "$SELF" == /tmp/wt-* ]]; then
      exec bash "/home/developer/artisan-mvp-temp/scripts/monitoring/betterstack-forwarder.sh" start
    fi
    if screen -ls 2>/dev/null | grep -qE "[0-9]+\.betterstack-forwarder[[:space:]]"; then
      echo "betterstack-forwarder already running" >&2; exit 0
    fi
    screen -dmS betterstack-forwarder bash "$SELF" _loop
    echo "betterstack-forwarder started (screen: betterstack-forwarder, log: $LOG)"
    ;;
  stop)
    screen -S betterstack-forwarder -X quit 2>/dev/null || true
    echo "betterstack-forwarder stopped"
    ;;
  status)
    if screen -ls 2>/dev/null | grep -qE "[0-9]+\.betterstack-forwarder[[:space:]]"; then
      echo "running"
    else
      echo "stopped"
    fi
    ;;
  tick)
    _tick
    ;;
  _loop)
    _loop
    ;;
  test)
    echo "=== betterstack-forwarder self-check ==="
    local_fail=0
    tmpdir="$(mktemp -d)"
    trap 'rm -rf "$tmpdir"' EXIT
    STATE_FILE="$tmpdir/state"

    # T1: _state_seen → false on unknown
    if ! _state_seen "unknown-000"; then
      echo "OK  _state_seen → false on unknown"
    else
      echo "FAIL _state_seen → true on unknown" >&2; local_fail=1
    fi

    # T2: _state_mark + _state_seen roundtrip
    _state_mark "inc-001"
    if _state_seen "inc-001"; then
      echo "OK  _state_mark + _state_seen roundtrip"
    else
      echo "FAIL not found after mark" >&2; local_fail=1
    fi

    # T3: known ID not re-notified
    _state_mark "inc-001"
    if _state_seen "inc-001"; then
      echo "OK  duplicate mark — still found (dedup via _state_seen)"
    else
      echo "FAIL lost after duplicate mark" >&2; local_fail=1
    fi

    # T4: tail trim keeps state bounded
    for i in $(seq 1 510); do echo "id-$i" >> "$STATE_FILE"; done
    _state_mark "id-trim-trigger"
    lines="$(wc -l < "$STATE_FILE")"
    if [[ "$lines" -le 501 ]]; then
      echo "OK  state trim: ${lines} lines ≤ 501"
    else
      echo "FAIL state grew unbounded: ${lines} lines" >&2; local_fail=1
    fi

    # T5: _api_key from env
    BETTERSTACK_API_KEY="test-key-from-env"
    result="$(_api_key)"
    if [[ "$result" == "test-key-from-env" ]]; then
      echo "OK  _api_key reads from BETTERSTACK_API_KEY env"
    else
      echo "FAIL _api_key returned '$result'" >&2; local_fail=1
    fi
    unset BETTERSTACK_API_KEY

    # T6: _api_key from config file
    mkdir -p "$tmpdir/.config/operioz"
    printf "test-key-from-file" > "$tmpdir/.config/operioz/betterstack-api-key"
    result="$(HOME="$tmpdir" _api_key 2>/dev/null || true)"
    if [[ "$result" == "test-key-from-file" ]]; then
      echo "OK  _api_key reads from config file"
    else
      echo "FAIL _api_key from file returned '$result'" >&2; local_fail=1
    fi

    [[ "$local_fail" -eq 0 ]] && echo "=== all tests passed ===" || { echo "=== FAILED ===" >&2; exit 1; }
    ;;
  *)
    echo "Usage: $0 start|stop|status|tick|test" >&2; exit 2
    ;;
esac
