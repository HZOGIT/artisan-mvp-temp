#!/usr/bin/env bash
# Lance un script Playwright (.mjs) dans l'image officielle, avec le package
# playwright installé dans un dossier isolé (hors repo). Navigateurs déjà dans l'image.
# Usage: scripts/pw-run.sh <script.mjs> [VAR=val ...]
set -euo pipefail
export DOCKER_HOST=${DOCKER_HOST:-unix:///run/user/1001/docker.sock}
IMG=mcr.microsoft.com/playwright:v1.48.0-jammy
SCRIPT="${1:?usage: pw-run.sh <script.mjs>}"; shift || true
ENVARGS=(-e "E2E_PASS=${E2E_PASS:-Azerqsdf1234!}" -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)
for kv in "$@"; do ENVARGS+=(-e "$kv"); done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm "${ENVARGS[@]}" -v "$ROOT":/work:ro "$IMG" sh -c '
  if [ ! -d /pw/node_modules/playwright ]; then
    mkdir -p /pw && cd /pw && npm init -y >/dev/null 2>&1 && npm i playwright@1.48.0 --no-audit --no-fund >/tmp/n.log 2>&1 || { echo NPM_FAIL; tail -5 /tmp/n.log; exit 1; }
  fi
  cp /work/'"$SCRIPT"' /pw/run.mjs && cd /pw && node run.mjs'
