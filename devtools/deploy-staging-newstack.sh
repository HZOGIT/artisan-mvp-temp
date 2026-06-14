#!/usr/bin/env bash
# Déploiement du NOUVEAU STACK clean-archi en staging.
#
# À lancer à CHAQUE itération de la refonte qui touche src/** : rebuild de l'image
# (docker compose --build), recréation du conteneur `new-stack`, puis SMOKE (health +
# résolution des domaines servis par le nouveau stack). Échoue si le smoke échoue → on
# ne « déploie » jamais un stack cassé.
#
# Le routage du trafic (dispatcher edge Cloudflare Pages, functions/_lib/dispatch.mjs) est
# déployé séparément par git push origin staging (build Pages). Ce script ne gère QUE le
# backend conteneurisé du nouveau stack.
#
# Usage : ./devtools/deploy-staging-newstack.sh
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.staging.yml --env-file .env.staging"
NEWSTACK_URL="http://localhost:3010"

echo "▶ Rebuild + recreate du conteneur new-stack (docker compose --build)…"
$COMPOSE up -d --build new-stack

echo "▶ Attente du démarrage (health)…"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "$NEWSTACK_URL/health" 2>/dev/null; then
    echo "  health OK"
    break
  fi
  [ "$i" = "30" ] && { echo "✖ health KO après 30s"; $COMPOSE logs --tail=40 new-stack; exit 1; }
  sleep 1
done

# Domaines servis par le nouveau stack = DEFAULT_ENABLED de l'edge (source : src migrated-domains.ts
# STAGING_NEW_STACK_DEFAULT_DOMAINS). Smoke : la route tRPC doit exister (401 sans cookie = OK ;
# 404 = route absente → déploiement cassé). On teste une procédure `list`/`get` par domaine.
SMOKE_PROCS="vehicules.list notifications.list fournisseurs.list parametres.get modelesEmail.list relances.list conges.list badges.list stocks.list techniciens.list rdv.list"
echo "▶ Smoke des domaines servis par le nouveau stack (401 attendu = route présente, auth requise)…"
fail=0
for p in $SMOKE_PROCS; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$NEWSTACK_URL/api/trpc/$p?batch=1&input=%7B%7D")
  if [ "$code" = "401" ] || [ "$code" = "200" ]; then
    echo "  ✓ $p -> $code"
  else
    echo "  ✖ $p -> $code (attendu 401/200)"; fail=1
  fi
done
[ "$fail" = "0" ] || { echo "✖ Smoke KO — le nouveau stack ne sert pas tous les domaines activés."; exit 1; }

# Smoke AUTHENTIFIÉ (faux users staging + JWT) : prouve que les endpoints répondent 200 pour de
# vrais utilisateurs, pas seulement 401. Cf. devtools/smoke-staging-newstack.sh.
echo "▶ Smoke authentifié (faux users staging)…"
./devtools/smoke-staging-newstack.sh

echo "✓ Nouveau stack déployé + smoke (anonyme & authentifié) OK ($NEWSTACK_URL). Routage trafic = ./devtools/deploy-staging-pages.sh (wrangler)."
