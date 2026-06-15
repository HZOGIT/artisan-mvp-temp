#!/usr/bin/env bash
# broadcast.sh — diffuse une ligne d'avancement de la boucle "tests manquants" sur 3 canaux :
#   1. journal local (docs/testing/journal-tests-manquants.md) — append horodaté
#   2. ntfy public (operioz-claude-code-2026) via ntfy-pub.sh
#   3. bus inter-agents → human via notify.sh
# (Le 4ᵉ canal = Linear, posté séparément par l'agent via MCP.)
#
# Usage: broadcast.sh <TAG> <TITRE> <MESSAGE...>
#   TAG : un de  start | done | fix | red | blocked | info
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
JOURNAL="$ROOT/docs/testing/journal-tests-manquants.md"
TAG="${1:?usage: broadcast.sh <TAG> <TITRE> <MESSAGE...>}"; shift
TITRE="${1:?usage: broadcast.sh <TAG> <TITRE> <MESSAGE...>}"; shift
MSG="$*"
TS="$(date -u '+%Y-%m-%d %H:%M:%SZ')"

case "$TAG" in
  done) EMO="white_check_mark"; BUSTYPE="TASK_DONE" ;;
  fix)  EMO="hammer";           BUSTYPE="TASK_DONE" ;;
  red)  EMO="warning";          BUSTYPE="ALERT" ;;
  blocked) EMO="rotating_light"; BUSTYPE="BLOCKED" ;;
  start) EMO="rocket";          BUSTYPE="ACK" ;;
  *)    EMO="gear";             BUSTYPE="ACK" ;;
esac

# 1. Journal (append). Tolérant si le fichier n'existe pas encore.
printf -- "- \`%s\` **[%s]** %s — %s\n" "$TS" "$TAG" "$TITRE" "$MSG" >> "$JOURNAL" 2>/dev/null || true

# 2. ntfy (best-effort, ne casse jamais la boucle)
"$HERE/../agents/ntfy-pub.sh" "tests-loop: $TITRE" "$MSG" "$EMO" >/dev/null 2>&1 || true

# 3. bus → human (best-effort, --no-wake pour ne pas spammer la TUI humaine)
"$HERE/../agents/notify.sh" --no-wake human "$BUSTYPE" "[tests-loop] $TITRE — $MSG" >/dev/null 2>&1 || true

echo "broadcast ok: [$TAG] $TITRE"
