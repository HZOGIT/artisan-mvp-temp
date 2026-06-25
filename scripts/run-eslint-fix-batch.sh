#!/usr/bin/env bash
set -euo pipefail

WORKDIR="/home/developer/artisan-mvp-temp"
PROMPT="$WORKDIR/scripts/prompts/fix-eslint-violations-batch.md"

if screen -ls 2>/dev/null | grep -q "fix-eslint-"; then
  echo "$(date -u): session fix-eslint déjà en cours, skip." >> /tmp/eslint-fix-cron.log
  exit 0
fi

SESSION="fix-eslint-$(date +%s)"
cd "$WORKDIR"

echo "$(date -u): lancement session $SESSION" >> /tmp/eslint-fix-cron.log
INIT_PROMPT="$PROMPT" ./scripts/launch-claude-bg.sh "$SESSION" >> /tmp/eslint-fix-cron.log 2>&1
