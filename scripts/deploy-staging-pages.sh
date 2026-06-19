#!/usr/bin/env bash
# Déploiement du FRONT + DISPATCHER edge (Cloudflare Pages, projet `artisan-staging`) en staging.
# Le projet Pages est en DIRECT UPLOAD (pas connecté au git) → un `git push` ne le déploie PAS :
# il faut pousser le build via wrangler. Ce script (re)build le front (vite) et téléverse le
# répertoire statique + le dossier `functions/` (la Pages Function `api/[[path]].js` = dispatcher
# qui route /api/* vers legacy ou new-stack selon functions/_lib/dispatch.mjs).
#
# Credentials Cloudflare lus depuis .env (NON committé). Usage : ./scripts/deploy-staging-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."

export CLOUDFLARE_API_TOKEN=$(grep -E '^CLOUDFLARE_API_TOKEN=' .env | cut -d= -f2- | tr -d "\"'")
export CLOUDFLARE_ACCOUNT_ID=$(grep -E '^CLOUDFLARE_ACCOUNT_ID=' .env | cut -d= -f2- | tr -d "\"'")
[ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "✖ CLOUDFLARE_API_TOKEN absent de .env"; exit 1; }

echo "▶ Build du front (vite → dist/public)…"
npx vite build

echo "▶ Déploiement Pages (front + functions/ dispatcher) sur artisan-staging (branche staging)…"
# `functions/` (à la racine du repo) est compilé automatiquement par wrangler.
npx wrangler pages deploy dist/public \
  --project-name artisan-staging \
  --branch staging \
  --commit-dirty=true

echo "✓ Pages déployé. Vérifier l'en-tête x-operioz-backend sur https://staging.operioz.com/api/trpc/<domaine>.list"
