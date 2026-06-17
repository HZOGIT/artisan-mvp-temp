#!/usr/bin/env bash
# wake.sh — réveille la session screen `ope-403-refonte-frontend` toutes les 2 min (cron) pour qu'elle
# exécute la prochaine itération de la refonte frontend. Calqué sur le wake du bus inter-agents
# (screen -X stuff <texte>, pause, puis un \r SÉPARÉ pour valider — cf. notify.sh).
#
# Garde anti-chevauchement : si une itération est en cours (lock frais < STALE_MIN), on ne réveille pas
# (2 min < durée d'une itération). L'agent touche le lock au début et le retire à la fin de l'itération.
#
# Usage (cron) : */2 * * * * /home/developer/artisan-mvp-temp/devtools/refonte-loop/wake.sh >> /tmp/refonte-loop-wake.log 2>&1
set -euo pipefail

SESSION="ope-403-refonte-frontend"
LOCK="/tmp/refonte-loop.lock"
STALE_MIN=20                 # un lock plus vieux que ça est considéré périmé (itération plantée)
TS="$(date -u '+%Y-%m-%d %H:%M:%SZ')"

# Session vivante ?
if ! screen -ls 2>/dev/null | grep -qE "[0-9]+\.${SESSION}[[:space:]]"; then
  echo "[$TS] session '$SESSION' absente — pas de réveil (relancer via launch-claude-bg.sh)"; exit 0
fi

# Itération en cours ? (lock frais)
if [[ -f "$LOCK" ]]; then
  if [[ -n "$(find "$LOCK" -mmin -"$STALE_MIN" 2>/dev/null)" ]]; then
    echo "[$TS] itération en cours (lock frais) — skip"; exit 0
  fi
  echo "[$TS] lock périmé (> ${STALE_MIN} min) — on réveille quand même"
fi

NUDGE="[cron-refonte $TS] Relis docs/frontend/journal-refonte-frontend.md et exécute la PROCHAINE CIBLE (une itération). touch $LOCK au début, supprime-le à la fin."

# Recette robuste : stuff le texte, courte pause, puis un \r seul pour valider.
screen -S "$SESSION" -X stuff "$NUDGE"
sleep 1
screen -S "$SESSION" -X stuff $'\r'
echo "[$TS] réveil envoyé à '$SESSION'"
