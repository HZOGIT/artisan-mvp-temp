#!/usr/bin/env bash
#
# _bus_common.sh — shared helpers for the agent message bus.
# Sourced by notify.sh / listen.sh / agents-status.sh. Not meant to be run alone.
#
# The bus is a file-based mailbox queue: each message is one JSON file dropped
# atomically into the recipient's inbox, mirrored to an append-only audit log.
# Delivery wakes the recipient's `screen` session via `screen -X stuff`.
#
# No external dependency beyond coreutils + python3 (for JSON) + screen.
# ---------------------------------------------------------------------------

# Root of the bus state. Runtime data, NOT committed to git. Override with env.
BUS_DIR="${AGENT_BUS_DIR:-$HOME/.agent-bus}"
BUS_INBOX="$BUS_DIR/inbox"
BUS_PROCESSED="$BUS_DIR/processed"
BUS_LOG="$BUS_DIR/bus.log"

# Known message types (see CLAUDE.md "Communication inter-agents").
BUS_TYPES="TASK_DELEGATE TASK_DONE REQUEST_REVIEW BLOCKED ALERT ACK"

# Reserved recipient that means "the human operator" — never has a screen.
BUS_HUMAN="human"

bus_init_dirs() {
  mkdir -p "$BUS_INBOX" "$BUS_PROCESSED"
  [[ -f "$BUS_LOG" ]] || : >"$BUS_LOG"
  # SECURITY: the bus holds inter-agent traffic. Lock it to the owner only so no
  # other local user can read/inject messages. (umask-independent.)
  chmod 700 "$BUS_DIR" 2>/dev/null || true
  chmod 600 "$BUS_LOG" 2>/dev/null || true
}

# --- End-to-end encryption (used only by the optional ntfy transport) --------
# Confidentiality does NOT rely on the (self-hosted) broker or the topic name:
# payloads are encrypted with a pre-shared key so a broker only ever sees
# ciphertext. AES-256-CBC + PBKDF2 + random salt, base64 (single-line, safe for
# ntfy and for `screen -X stuff`). Key comes from $AGENT_BUS_SECRET.
bus_have_secret() { [[ -n "${AGENT_BUS_SECRET:-}" ]]; }

bus_encrypt() {  # stdin -> ciphertext (base64, one line) on stdout
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -base64 -A \
    -pass "pass:${AGENT_BUS_SECRET:?AGENT_BUS_SECRET required to encrypt}"
}

bus_decrypt() {  # stdin (base64 ciphertext) -> plaintext on stdout
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -base64 -A \
    -pass "pass:${AGENT_BUS_SECRET:?AGENT_BUS_SECRET required to decrypt}"
}

# Identity of the *current* agent (the sender).
#   1. $AGENT_NAME if explicitly set
#   2. the screen session name (STY = "<pid>.<name>")
#   3. fallback to user@host
bus_self() {
  if [[ -n "${AGENT_NAME:-}" ]]; then
    printf '%s' "$AGENT_NAME"
  elif [[ -n "${STY:-}" ]]; then
    printf '%s' "${STY#*.}"
  else
    printf '%s@%s' "${USER:-unknown}" "$(hostname -s 2>/dev/null || echo host)"
  fi
}

# Does a screen session with this exact name exist?
bus_screen_exists() {
  local name="$1"
  screen -ls 2>/dev/null | grep -qE "[0-9]+\.${name}[[:space:]]"
}

# UTC ISO-8601 timestamp.
bus_ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Build one JSON message line. Args: id from to type timestamp payload
# Uses python3 so payloads with quotes/newlines/unicode are encoded safely.
bus_json() {
  python3 - "$@" <<'PY'
import json, sys
_, mid, frm, to, mtype, ts, payload = sys.argv
print(json.dumps({
    "id": mid, "from": frm, "to": to,
    "type": mtype, "payload": payload, "timestamp": ts,
}, ensure_ascii=False))
PY
}

# Pretty one-line human summary of a message file. Arg: path to JSON file.
bus_fmt() {
  python3 - "$1" <<'PY'
import json, sys
try:
    m = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"  <unreadable: {e}>"); sys.exit(0)
print(f"  [{m.get('timestamp','?')}] {m.get('from','?')} -> {m.get('to','?')}  "
      f"{m.get('type','?')}: {m.get('payload','')}")
PY
}
