#!/usr/bin/env bash
#
# ntfy-inbox-bridge.sh — secure ntfy -> Claude screen bridge (ntfy transport).
#
# One bridge per agent. It subscribes to that agent's topic on a *self-hosted,
# authenticated* ntfy, DECRYPTS each message (E2E, AES-256), records it in the
# local inbox/log (audit), then wakes the agent's `screen` TUI by stuffing the
# nudge text + a separate CR (\r) — because Claude Code validates input on CR,
# not LF.
#
# RELIABILITY: streams /json with `since=<last_id>`. On any reconnect (network
# blip, restart, max-time) ntfy REPLAYS messages published during the gap, so
# nothing is lost. The last seen id is persisted; a dedup set drops replays.
#
# SECURITY: never uses public ntfy.sh. Requires an https self-hosted broker, a
# bearer token, and the shared AES key — so even the broker only sees
# ciphertext. (Topic name is NOT the security boundary.)
#
# Usage:
#   AGENT_BUS_NTFY_URL=https://ntfy.internal.example \
#   AGENT_BUS_NTFY_TOKEN=tk_xxx \
#   AGENT_BUS_SECRET=... \
#   AGENT_BUS_NTFY_PREFIX=agentic-factory \
#     ./devtools/agents/ntfy-inbox-bridge.sh <agent-name>
#
# Run it detached, one per agent, e.g. from launch:
#   screen -dmS bridge-<agent> ./devtools/agents/ntfy-inbox-bridge.sh <agent>
# ---------------------------------------------------------------------------
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_bus_common.sh
source "$HERE/_bus_common.sh"

AGENT="${1:?usage: ntfy-inbox-bridge.sh <agent-name>}"
PREFIX="${AGENT_BUS_NTFY_PREFIX:?AGENT_BUS_NTFY_PREFIX required}"
URL="${AGENT_BUS_NTFY_URL:?AGENT_BUS_NTFY_URL required (https self-hosted)}"
TOKEN="${AGENT_BUS_NTFY_TOKEN:?AGENT_BUS_NTFY_TOKEN required}"
bus_have_secret || { echo "[bridge] FATAL: AGENT_BUS_SECRET required" >&2; exit 1; }

case "$URL" in https://ntfy.sh*) echo "[bridge] FATAL: refusing public ntfy.sh" >&2; exit 1;; https://*) :;; *) echo "[bridge] FATAL: AGENT_BUS_NTFY_URL must be https" >&2; exit 1;; esac

TOPIC="${PREFIX}-${AGENT}"
STATE="${XDG_RUNTIME_DIR:-/tmp}/agent-bus-bridge-${TOPIC}.since"
bus_init_dirs
[[ -f "$STATE" ]] || date +%s >"$STATE"
echo "[bridge] up pid=$$ agent=${AGENT} topic=${TOPIC} url=${URL} since=$(cat "$STATE")"

# Deliver a decrypted message (raw JSON line) to the agent.
deliver() {
  local json="$1"
  # mirror to local inbox + audit log (durability/trace, same as file transport)
  local id seq f
  id="$(printf '%s' "$json" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("id","msg"))' 2>/dev/null || echo msg)"
  seq="$(date +%s%N)"
  mkdir -p "$BUS_INBOX/$AGENT"
  f="$BUS_INBOX/$AGENT/${seq}-ntfy-${id//\//_}.json"
  printf '%s\n' "$json" >"$f"
  printf '%s\n' "$json" >>"$BUS_LOG"
  # wake the TUI: nudge text, pause, then a lone CR to submit
  if bus_screen_exists "$AGENT"; then
    screen -S "$AGENT" -X stuff "📨 [agent-bus] Nouveau message. Lis: ./devtools/agents/listen.sh ${AGENT} --drain puis agis."
    sleep "${AGENT_BUS_WAKE_DELAY:-1}"
    screen -S "$AGENT" -X stuff $'\r'
    echo "[bridge] -> woke '${AGENT}' ($id)"
  else
    echo "[bridge] queued for '${AGENT}' (no screen) ($id)"
  fi
}

while true; do
  SINCE="$(cat "$STATE" 2>/dev/null || date +%s)"
  curl -sN --max-time 3600 \
    -H "Authorization: Bearer $TOKEN" \
    "${URL}/${TOPIC}/json?since=${SINCE}" \
  | while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      # parse the ntfy envelope; act only on real messages
      read -r EV ID CIPHER < <(printf '%s' "$line" | python3 -c '
import json,sys
try: j=json.load(sys.stdin)
except Exception: sys.exit(0)
print(j.get("event",""), j.get("id",""), json.dumps(j.get("message","")))
' 2>/dev/null)
      [[ "$EV" != "message" ]] && continue
      echo "$ID" >"$STATE"                       # advance backfill cursor
      # dedup on reconnect replays
      SEEN="${XDG_RUNTIME_DIR:-/tmp}/agent-bus-bridge-${TOPIC}.seen"
      grep -qxF "$ID" "$SEEN" 2>/dev/null && continue
      echo "$ID" >>"$SEEN"; tail -n 500 "$SEEN" >"$SEEN.tmp" 2>/dev/null && mv "$SEEN.tmp" "$SEEN"
      # CIPHER is a JSON-encoded string (the encrypted base64 body) -> decode
      MSG="$(printf '%s' "$CIPHER" | python3 -c 'import json,sys;print(json.load(sys.stdin))')"
      # decrypt to the original JSON message
      if PLAIN="$(printf '%s' "$MSG" | bus_decrypt 2>/dev/null)"; then
        deliver "$PLAIN"
      else
        echo "[bridge] WARN: decrypt failed for $ID (wrong AGENT_BUS_SECRET?)" >&2
      fi
    done
  echo "[bridge] stream closed, reconnecting (since=$(cat "$STATE")) in 2s"
  sleep 2
done
