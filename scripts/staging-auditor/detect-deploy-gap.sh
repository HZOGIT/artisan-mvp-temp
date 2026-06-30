#!/usr/bin/env bash
# detect-deploy-gap.sh — Compare le SHA git embarqué dans le conteneur actif
# à origin/staging HEAD. SHA == HEAD → à jour (exit 0). SHA ≠ HEAD → gap (exit 1).
#
# Remplace l'heuristique timestamp (docker inspect Created + git log --after=…)
# qui ratait les déploiements cascade (plusieurs PRs mergées/déployées en séquence
# rapide → fausses alertes répétées).
#
# Usage : ./scripts/staging-auditor/detect-deploy-gap.sh
# Retour : 0 = à jour | 1 = gap | 2 = SHA inconnu (rebuild nécessaire)
set -euo pipefail
cd "$(dirname "$0")/../.."

SLOT_FILE="$HOME/.active-slot"
SLOT=$(cat "$SLOT_FILE" 2>/dev/null || echo "blue")
CONTAINER="artisan-staging-new-stack-${SLOT}-1"

DEPLOYED_SHA=$(docker inspect "$CONTAINER" \
  --format '{{index .Config.Labels "git.sha"}}' 2>/dev/null || echo "")

if [ -z "$DEPLOYED_SHA" ] || [ "$DEPLOYED_SHA" = "unknown" ]; then
  echo "WARN: label git.sha absent du conteneur $CONTAINER (premier déploiement après le fix ?)"
  exit 2
fi

git fetch origin staging -q
STAGING_SHA=$(git rev-parse origin/staging)

if [ "$DEPLOYED_SHA" = "$STAGING_SHA" ]; then
  echo "OK: conteneur ($DEPLOYED_SHA) == origin/staging — staging à jour"
  exit 0
fi

GAP=$(git rev-list "${DEPLOYED_SHA}..origin/staging" --count 2>/dev/null || echo "?")
echo "GAP: $GAP commit(s) non déployés — conteneur=$DEPLOYED_SHA staging=$STAGING_SHA"
exit 1
