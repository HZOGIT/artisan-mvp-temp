#!/usr/bin/env bash
# cron-daemon.sh — substitut de cron (cette machine n'a pas `crontab`). Boucle qui réveille la session
# de refonte toutes les 120 s via wake.sh. À lancer DÉTACHÉ dans son propre screen :
#   screen -dmS refonte-cron /home/developer/artisan-mvp-temp/scripts/refonte-loop/cron-daemon.sh
# Stop : screen -S refonte-cron -X quit
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WAKE="$HERE/wake.sh"
INTERVAL="${REFONTE_WAKE_INTERVAL:-120}"   # 2 min (D1)
LOG="/tmp/refonte-loop-wake.log"

echo "[cron-daemon] démarré (interval=${INTERVAL}s) $(date -u '+%F %T')Z" >> "$LOG"
while true; do
  "$WAKE" >> "$LOG" 2>&1 || true
  sleep "$INTERVAL"
done
