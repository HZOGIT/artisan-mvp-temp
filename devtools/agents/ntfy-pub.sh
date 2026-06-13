#!/usr/bin/env bash
# ntfy-pub.sh — push a progress line to the PUBLIC ntfy topic for the OPE-184 refonte.
#
# Public topic (operioz-claude-code-2026): NEVER send secrets/PII — status, issue refs, links only.
#
# Usage: ./devtools/agents/ntfy-pub.sh "<title>" "<message>" [tags]
#   tags examples: rocket white_check_mark warning rotating_light gear hammer
set -euo pipefail
TOPIC="operioz-claude-code-2026"
TITLE="${1:?usage: ntfy-pub.sh <title> <message> [tags]}"
MSG="${2:?usage: ntfy-pub.sh <title> <message> [tags]}"
TAGS="${3:-gear}"
curl -s -m 10 \
  -H "Title: ${TITLE}" \
  -H "Tags: ${TAGS}" \
  -d "${MSG}" \
  "https://ntfy.sh/${TOPIC}" \
  -o /dev/null -w "ntfy %{http_code}\n"
