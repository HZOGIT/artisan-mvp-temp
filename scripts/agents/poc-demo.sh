#!/usr/bin/env bash
#
# poc-demo.sh — proof of concept for the agent message bus.
#
# Spins up two mini-agents in `screen` sessions. Each runs listen.sh in
# --follow mode and reacts to messages with a tiny bash dispatcher (standing in
# for what a Claude agent would do on a wake nudge). We then kick off a chain:
#
#   poc-feature-dev --TASK_DONE--> poc-unit-tests --REQUEST_REVIEW--> poc-reviewer
#
# and watch each hop land. Self-contained, leaves no screens behind.
#
# Run:  ./scripts/agents/poc-demo.sh
# ---------------------------------------------------------------------------
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_bus_common.sh"

A=poc-feature-dev
B=poc-unit-tests
C=poc-reviewer
TRACE="$(mktemp /tmp/poc-bus-trace.XXXXXX)"

cleanup() {
  for s in "$A" "$B" "$C"; do screen -S "$s" -X quit >/dev/null 2>&1 || true; done
  rm -rf "$BUS_INBOX/$A" "$BUS_INBOX/$B" "$BUS_INBOX/$C" \
         "$BUS_PROCESSED/$A" "$BUS_PROCESSED/$B" "$BUS_PROCESSED/$C" 2>/dev/null || true
}
trap cleanup EXIT

# A reactor: follow my inbox; on each message, log it and fire the next hop.
reactor() {
  local me="$1" trace="$2"
  # NOTE: runs as a plain bash agent. A real Claude agent would instead be
  # woken by the stuffed nudge and call listen.sh --drain itself.
  "$HERE/listen.sh" "$me" --follow 2>/dev/null | while IFS= read -r line; do
    case "$line" in
      '{'*) ;;                    # only act on raw JSON lines
      *) continue ;;
    esac
    local type payload from
    type=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["type"])' "$line")
    from=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["from"])' "$line")
    payload=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["payload"])' "$line")
    echo "[$me] received $type from $from: $payload" >>"$trace"
    case "$me::$type" in
      "$B::TASK_DONE")
        AGENT_NAME="$me" "$HERE/notify.sh" --no-wake "$C" REQUEST_REVIEW \
          "Tests written for: $payload — please review." ;;
      "$C::REQUEST_REVIEW")
        echo "[$me] ✅ review complete — chain finished." >>"$trace" ;;
    esac
  done
}
export -f reactor
export HERE A B C BUS_INBOX BUS_PROCESSED

echo "Starting mini-agents: $A (driver), $B, $C …"
screen -dmS "$B" bash -c "reactor '$B' '$TRACE'"
screen -dmS "$C" bash -c "reactor '$C' '$TRACE'"
# $A is just the kickoff driver — no inbox reactor needed.
sleep 1

echo "Kickoff: $A -> $B  TASK_DONE"
AGENT_NAME="$A" "$HERE/notify.sh" --no-wake "$B" TASK_DONE \
  "feature 'auth' merged on branch feat/auth"

# Wait (poll) for the chain to reach the reviewer.
echo -n "Waiting for chain to complete"
for _ in $(seq 1 20); do
  if grep -q "chain finished" "$TRACE" 2>/dev/null; then echo " done."; break; fi
  echo -n "."; sleep 0.5
done
echo
echo "=== TRACE ==="
cat "$TRACE"
echo "============="
if grep -q "chain finished" "$TRACE"; then
  echo "PoC OK ✅  — message delivered across 3 agents."
else
  echo "PoC FAILED ❌ — chain did not complete (see trace above)." >&2
  exit 1
fi
