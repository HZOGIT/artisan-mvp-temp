#!/usr/bin/env bash
#
# agents-status.sh — list active agents (screen sessions) and their bus state.
#
# Usage:
#   ./scripts/agents/agents-status.sh
#
# Shows, for every running `screen` session: its name, pid, attached/detached
# state, start time, and how many unread messages sit in its bus inbox.
# Also lists inboxes that have pending mail but no running session (orphans).
#
# Env: AGENT_BUS_DIR (default ~/.agent-bus)
# ---------------------------------------------------------------------------
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_bus_common.sh
source "$HERE/_bus_common.sh"

bus_init_dirs

inbox_count() {
  local name="$1" d="$BUS_INBOX/$1"
  [[ -d "$d" ]] || { echo 0; return; }
  find "$d" -maxdepth 1 -name '*.json' 2>/dev/null | wc -l | tr -d ' '
}

printf '%-34s %-10s %-9s %-19s %s\n' "AGENT (screen)" "PID" "STATE" "STARTED" "INBOX"
printf '%-34s %-10s %-9s %-19s %s\n' "----------------------------------" "----------" "---------" "-------------------" "-----"

# Parse `screen -ls`. Lines look like:
#   <pid>.<name>\t(MM/DD/YY HH:MM:SS)\t(Detached)
declare -A SEEN
while IFS= read -r line; do
  [[ "$line" =~ ^[[:space:]]+[0-9]+\. ]] || continue
  entry="$(echo "$line" | awk '{print $1}')"      # pid.name
  pid="${entry%%.*}"
  name="${entry#*.}"
  started="$(echo "$line" | sed -nE 's/.*\(([0-9]{2}\/[0-9]{2}\/[0-9]{2} [0-9:]+)\).*/\1/p')"
  state="$(echo "$line" | grep -oE '\((Attached|Detached)\)' | tr -d '()')"
  SEEN["$name"]=1
  printf '%-34s %-10s %-9s %-19s %s\n' "$name" "$pid" "${state:-?}" "${started:-?}" "$(inbox_count "$name")"
done < <(screen -ls 2>/dev/null)

# Orphan inboxes: pending mail for an agent that has no running screen.
ORPHANS=""
if [[ -d "$BUS_INBOX" ]]; then
  for d in "$BUS_INBOX"/*/; do
    [[ -d "$d" ]] || continue
    name="$(basename "$d")"
    [[ -n "${SEEN[$name]:-}" ]] && continue
    n="$(inbox_count "$name")"
    [[ "$n" -gt 0 ]] && ORPHANS+="  $name ($n pending)"$'\n'
  done
fi

if [[ -n "$ORPHANS" ]]; then
  echo
  echo "Inboxes with pending mail but NO running session:"
  printf '%s' "$ORPHANS"
fi

echo
echo "Bus dir: $BUS_DIR    Log: $BUS_LOG"
