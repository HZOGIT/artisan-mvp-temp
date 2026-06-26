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
# Usage : ./scripts/deploy-backend.sh
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f infra/docker-compose.yml --env-file .env.staging"
NEWSTACK_URL="http://localhost:3010"

echo "▶ Snapshot PostgreSQL avant déploiement…"
# Best-effort : un échec de snapshot ne DOIT JAMAIS bloquer le déploiement (set -e actif).
# Défaut = répertoire inscriptible par l'utilisateur deploy ; override via PG_BACKUP_DIR (ex. /var/backups/pg).
BACKUP_DIR="${PG_BACKUP_DIR:-$HOME/pg-backups}"
mkdir -p "$BACKUP_DIR" 2>/dev/null || { echo "  [WARN] $BACKUP_DIR non créable — snapshot ignoré"; BACKUP_DIR=""; }

PG_CONTAINER=$($COMPOSE ps -q postgres 2>/dev/null || true)
if [ -n "$BACKUP_DIR" ] && [ -n "$PG_CONTAINER" ]; then
  BACKUP_FILE="${BACKUP_DIR}/artisan_mvp_$(date +%Y%m%d_%H%M%S).dump"
  echo "  Sauvegarde vers $BACKUP_FILE…"
  docker exec "$PG_CONTAINER" pg_dump -U artisan_user -Fc artisan_mvp > "$BACKUP_FILE" 2>/dev/null || echo "  [WARN] snapshot échoué — déploiement continue"
  ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | tail -n +6 | xargs -r rm 2>/dev/null || true
  echo "  Snapshot terminé"
else
  echo "  [INFO] snapshot ignoré (répertoire indisponible ou conteneur postgres absent)"
fi

echo "▶ Déploiement blue-green…"
# $HOME/.active-slot survit aux reboots (contrairement à /tmp). Default = blue si absent.
SLOT_FILE="$HOME/.active-slot"
ACTIVE=$(cat "$SLOT_FILE" 2>/dev/null || echo "blue")
NEXT=$([ "$ACTIVE" = "blue" ] && echo "green" || echo "blue")
NEXT_EXT_PORT=$([ "$NEXT" = "blue" ] && echo "3011" || echo "3012")

echo "  Slot actif : $ACTIVE → nouveau slot : $NEXT (port $NEXT_EXT_PORT)"

# Générer infra/upstream.conf (gitignore) depuis le slot ACTIF avant tout démarrage.
# Le proxy nginx monte ce fichier — ne jamais modifier nginx.conf directement.
echo "upstream backend { server new-stack-$ACTIVE:3001; }" > infra/upstream.conf

# Idempotence : si le proxy n'est pas déjà up (1er run après renommage new-stack→proxy,
# ou restart serveur), démarrer tout le stack + purger les orphelins (ex. l'ancien
# conteneur new-stack). Les runs suivants trouvent le proxy en place et sautent ce bloc.
PROXY_ID=$($COMPOSE ps -q proxy 2>/dev/null || true)
if [ -z "$PROXY_ID" ]; then
  echo "  Proxy absent — démarrage complet du stack (--remove-orphans)…"
  $COMPOSE up -d --remove-orphans
fi

$COMPOSE up -d --build "new-stack-$NEXT"

echo "▶ Attente health du nouveau slot (new-stack-$NEXT)…"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://localhost:$NEXT_EXT_PORT/health" 2>/dev/null; then
    echo "  health OK"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "✖ health KO après 30s — rollback : arrêt de new-stack-$NEXT"
    $COMPOSE logs --tail=40 "new-stack-$NEXT"
    $COMPOSE stop "new-stack-$NEXT"
    exit 1
  fi
  sleep 1
done

echo "▶ Bascule nginx → new-stack-$NEXT…"
# Réécriture complète d'upstream.conf (pas de sed sur fichier suivi git).
echo "upstream backend { server new-stack-$NEXT:3001; }" > infra/upstream.conf

# Recréer le proxy si nginx.conf a changé (inode remplacé par git → reload ne suffit pas)
# Robuste vs historique git complexe : comparer les hashs du contenu réel
HOST_HASH=$(md5sum infra/nginx.conf 2>/dev/null | awk '{print $1}')
LIVE_HASH=$(docker exec "$($COMPOSE ps -q proxy)" md5sum /etc/nginx/nginx.conf 2>/dev/null | awk '{print $1}')
if [ "$HOST_HASH" != "$LIVE_HASH" ]; then
  echo "  nginx.conf modifié ($HOST_HASH vs $LIVE_HASH) — recréation du proxy (--force-recreate)…"
  $COMPOSE up -d --force-recreate proxy
else
  docker exec "$($COMPOSE ps -q proxy)" nginx -s reload
fi
echo "  Nginx rechargé — trafic → new-stack-$NEXT"

echo "▶ Grace period (5s) puis arrêt de new-stack-$ACTIVE…"
sleep 5
$COMPOSE stop "new-stack-$ACTIVE"
echo "$NEXT" > "$SLOT_FILE"
echo "  Slot actif mis à jour : $NEXT"

# Domaines servis par le nouveau stack = DEFAULT_ENABLED de l'edge (source : src migrated-domains.ts
# STAGING_NEW_STACK_DEFAULT_DOMAINS). Smoke : la route tRPC doit exister (401 sans cookie = OK ;
# 404 = route absente → déploiement cassé). On teste une procédure `list`/`get` par domaine.
SMOKE_PROCS="vehicules.list notifications.list fournisseurs.list parametres.get modelesEmail.list relances.list conges.list badges.list stocks.list techniciens.list rdv.list clients.list"
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
# vrais utilisateurs, pas seulement 401. Cf. scripts/smoke-staging-newstack.sh.
echo "▶ Smoke authentifié (faux users staging)…"
./scripts/smoke-staging-newstack.sh

echo "✓ Nouveau stack déployé + smoke (anonyme & authentifié) OK ($NEWSTACK_URL). Front : auto-déployé par Cloudflare Pages (GitHub integration, branche staging)."
