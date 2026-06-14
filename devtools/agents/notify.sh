#!/usr/bin/env bash
#
# notify.sh — send a message to another agent on the bus.
#
# Usage:
#   ./devtools/agents/notify.sh <to> <type> <payload...>
#
#   <to>        recipient agent name (= its screen session name), or "human"
#   <type>      one of: TASK_DELEGATE TASK_DONE REQUEST_REVIEW BLOCKED ALERT ACK
#   <payload>   free-text message (the rest of the args, may contain spaces)
#
# Options (before <to>):
#   --no-wake   deliver to the inbox + log only; do NOT poke the screen session
#
# Behaviour:
#   1. Writes the message atomically as a JSON file into the recipient inbox.
#   2. Appends it to the append-only audit log ($AGENT_BUS_DIR/bus.log).
#   3. Wakes the recipient by typing a short nudge into its screen session
#      (unless --no-wake, or the recipient is "human", or it has no screen).
#   4. For "human" (or ALERT) it can also push to ntfy — set AGENT_BUS_NTFY_TOPIC.
#
# Env:
#   AGENT_NAME             override the auto-detected sender name
#   AGENT_BUS_DIR          bus root (default: ~/.agent-bus, chmod 700)
#   AGENT_BUS_TRANSPORT    file (default, local screen-stuff) | ntfy (remote)
#   AGENT_BUS_WAKE_DELAY   seconds between text and Enter when stuffing (def 1)
#  ntfy transport / human push (all REQUIRED together — see security preflight):
#   AGENT_BUS_NTFY_URL     https URL of a *self-hosted* ntfy (public ntfy.sh refused)
#   AGENT_BUS_NTFY_TOKEN   ntfy access token (broker ACL deny-all by default)
#   AGENT_BUS_SECRET       pre-shared key — payloads are E2E-encrypted (AES-256)
#   AGENT_BUS_NTFY_PREFIX  topic prefix; recipient topic = "<prefix>-<agent>"
#   AGENT_BUS_NTFY_HUMAN_TOPIC  topic for human/ALERT push (optional)
#
# Example:
#   ./devtools/agents/notify.sh unit-tests TASK_DELEGATE \
#       "Auth module done on branch feat/auth — please write the unit tests."
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_bus_common.sh
source "$HERE/_bus_common.sh"

WAKE=1
if [[ "${1:-}" == "--no-wake" ]]; then WAKE=0; shift; fi

TO="${1:-}"; TYPE="${2:-}"; shift 2 2>/dev/null || true
PAYLOAD="${*:-}"

if [[ -z "$TO" || -z "$TYPE" ]]; then
  echo "Usage: $0 [--no-wake] <to> <type> <payload...>" >&2
  echo "Types: $BUS_TYPES" >&2
  exit 2
fi

# Validate type (warn but allow — forward compatibility for new types).
case " $BUS_TYPES " in
  *" $TYPE "*) : ;;
  *) echo "WARN: unknown type '$TYPE' (known: $BUS_TYPES)" >&2 ;;
esac

bus_init_dirs
FROM="$(bus_self)"
TS="$(bus_ts)"
SEQ="$(date +%s%N)"                       # nanosecond seq -> inbox ordering
ID="${SEQ}-${FROM}-${TYPE}"

DEST="$BUS_INBOX/$TO"
mkdir -p "$DEST"

# Atomic write: render to a tmp file, then mv into place so a reader never
# sees a half-written message.
TMP="$(mktemp "$DEST/.tmp.XXXXXX")"
bus_json "$ID" "$FROM" "$TO" "$TYPE" "$TS" "$PAYLOAD" >"$TMP"
FINAL="$DEST/${ID}.json"
mv -f "$TMP" "$FINAL"

# Audit log (append-only, one JSON line per message).
cat "$FINAL" >>"$BUS_LOG"

echo "sent: $FROM -> $TO  $TYPE  ($FINAL)"

# The local file inbox + log above is ALWAYS the durable record (audit trail +
# fallback). On top of it we pick a *wake/delivery transport*:
#
#   AGENT_BUS_TRANSPORT=file  (default) — wake by typing into the recipient's
#       screen (screen -X stuff). Zero network, zero third party. The recipient
#       reads with `listen.sh <name> --drain`.
#   AGENT_BUS_TRANSPORT=ntfy  — publish the JSON message to the recipient's
#       secret ntfy topic. A persistent ntfy-inbox-bridge.sh per agent receives
#       it (with backfill on reconnect — no loss) and stuffs the prompt itself.
#       Works across machines; doubles as the human push channel.
TRANSPORT="${AGENT_BUS_TRANSPORT:-file}"
NTFY_URL="${AGENT_BUS_NTFY_URL:-}"

# SECURITY guard for the ntfy transport. We refuse to send inter-agent traffic
# over an unauthenticated / cleartext public broker. To use ntfy you MUST set:
#   AGENT_BUS_NTFY_URL    https URL of a *self-hosted* ntfy (e.g. behind the
#                         project's Cloudflare tunnel) — public ntfy.sh refused
#   AGENT_BUS_NTFY_TOKEN  ntfy access token (server ACL = deny-all by default)
#   AGENT_BUS_SECRET      pre-shared key — payloads are E2E-encrypted so even
#                         the broker only ever sees ciphertext
# Override only for throwaway tests with AGENT_BUS_NTFY_INSECURE=1 (discouraged).
ntfy_secure_preflight() {
  [[ "${AGENT_BUS_NTFY_INSECURE:-0}" == "1" ]] && return 0
  local ok=1
  case "$NTFY_URL" in
    https://*) : ;;
    *) echo "ERROR: AGENT_BUS_NTFY_URL must be an https self-hosted ntfy (got: '${NTFY_URL:-unset}')." >&2; ok=0 ;;
  esac
  [[ "$NTFY_URL" == https://ntfy.sh* ]] && { echo "ERROR: refusing public ntfy.sh for agent traffic — self-host it." >&2; ok=0; }
  [[ -z "${AGENT_BUS_NTFY_TOKEN:-}" ]] && { echo "ERROR: AGENT_BUS_NTFY_TOKEN required (broker must be authenticated)." >&2; ok=0; }
  bus_have_secret || { echo "ERROR: AGENT_BUS_SECRET required (payloads are end-to-end encrypted)." >&2; ok=0; }
  [[ "$ok" -eq 1 ]]
}

# Publish the (encrypted) message to an ntfy topic. Args: topic, title.
ntfy_publish() {
  local topic="$1" title="$2" body
  if [[ "${AGENT_BUS_NTFY_INSECURE:-0}" == "1" ]]; then
    body="$(cat "$FINAL")"                       # cleartext — tests only
  else
    body="$(bus_encrypt <"$FINAL")"              # AES-256 ciphertext
  fi
  curl -s -m 5 \
    ${AGENT_BUS_NTFY_TOKEN:+-H "Authorization: Bearer $AGENT_BUS_NTFY_TOKEN"} \
    -H "Title: $title" \
    -H "X-Agent-Bus: 1" \
    -d "$body" \
    "$NTFY_URL/$topic" >/dev/null 2>&1
}

# --- Human push: ALERT or recipient "human" -> human topic (same security) ---
HUMAN_TOPIC="${AGENT_BUS_NTFY_HUMAN_TOPIC:-}"
if { [[ "$TO" == "$BUS_HUMAN" || "$TYPE" == "ALERT" ]]; } && [[ -n "$HUMAN_TOPIC" ]]; then
  if ntfy_secure_preflight; then
    ntfy_publish "$HUMAN_TOPIC" "[agent-bus] $TYPE from $FROM" \
      && echo "  (pushed to human topic '$HUMAN_TOPIC')" \
      || echo "  (ntfy human push failed — non-fatal)" >&2
  else
    echo "  (human push skipped — ntfy security preflight failed)" >&2
  fi
fi

# --- Wake / deliver to the recipient agent ---------------------------------
if [[ "$WAKE" -eq 1 && "$TO" != "$BUS_HUMAN" ]]; then
  case "$TRANSPORT" in
    ntfy)
      # Per-agent topic "<prefix>-<agent>" on an authenticated self-hosted ntfy;
      # the payload is E2E-encrypted. The bridge decrypts + wakes the TUI.
      if ! ntfy_secure_preflight; then
        echo "  (ntfy transport refused — message kept in local inbox; fix security env)" >&2
      else
        PREFIX="${AGENT_BUS_NTFY_PREFIX:?AGENT_BUS_NTFY_PREFIX required for ntfy transport}"
        TOPIC="${PREFIX}-${TO}"
        ntfy_publish "$TOPIC" "[agent-bus] $TYPE from $FROM" \
          && echo "  (published encrypted to topic '$TOPIC' — bridge will wake '$TO')" \
          || echo "  (ntfy publish failed — message still in local inbox)" >&2
      fi
      ;;
    file|*)
      # IMPORTANT — submitting to a Claude Code TUI:
      #   `screen -X stuff "text\n"` does NOT submit: in the prompt box `\n` just
      #   inserts a newline (multi-line input). Submit needs a *separate* `\r`
      #   (Enter) sent a moment later. Robust recipe = two stuffs:
      #     1) stuff text   2) brief pause   3) stuff a lone `\r`
      #   (Verified empirically — OPE-185. A plain `read`-loop shell agent would
      #    accept `\n`; real agents run the TUI, hence this dance.)
      if bus_screen_exists "$TO"; then
        NUDGE="📨 [agent-bus] Nouveau message de '${FROM}' (type ${TYPE}). "
        NUDGE+="Lis ta boite avec: ./devtools/agents/listen.sh ${TO} --drain "
        NUDGE+="puis agis selon le type et le payload."
        screen -S "$TO" -X stuff "$NUDGE"
        sleep "${AGENT_BUS_WAKE_DELAY:-1}"
        screen -S "$TO" -X stuff $'\r'
        echo "  (woke screen '$TO')"
      else
        echo "  (no screen '$TO' — message queued; it will read on next listen)" >&2
      fi
      ;;
  esac
fi
