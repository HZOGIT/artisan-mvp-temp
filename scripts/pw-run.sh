#!/usr/bin/env bash
# Lance un script Playwright (.mjs) dans l'image officielle. Le package `playwright` est installé
# UNE SEULE FOIS dans un volume Docker nommé persistant (`PW_VOLUME`), puis réutilisé à chaque run
# (le conteneur est `--rm` donc tout `/pw` interne serait sinon perdu → réinstall à chaque fois).
# Navigateurs déjà présents dans l'image. Usage: scripts/pw-run.sh <script.mjs> [VAR=val ...]
set -euo pipefail
export DOCKER_HOST=${DOCKER_HOST:-unix:///run/user/1001/docker.sock}
IMG=mcr.microsoft.com/playwright:v1.48.0-jammy
PW_VERSION=1.48.0           # doit suivre le tag de l'image ci-dessus
PW_VOLUME=${PW_VOLUME:-operioz-pw-${PW_VERSION}}  # cache node_modules persistant (versionné)
SCRIPT="${1:?usage: pw-run.sh <script.mjs>}"; shift || true
ENVARGS=(-e "E2E_PASS=${E2E_PASS:-Azerqsdf1234!}" -e PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1)
for kv in "$@"; do ENVARGS+=(-e "$kv"); done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Le volume nommé survit entre les runs → l'install npm n'a lieu qu'au premier appel (cache froid).
docker run --rm "${ENVARGS[@]}" -v "$ROOT":/work:ro -v "$PW_VOLUME":/pw "$IMG" sh -c '
  if [ ! -d /pw/node_modules/playwright ]; then
    echo "[pw-run] cache froid → installation playwright@'"$PW_VERSION"' (une seule fois)…" >&2
    cd /pw && npm init -y >/dev/null 2>&1 && npm i playwright@'"$PW_VERSION"' --no-audit --no-fund >/tmp/n.log 2>&1 || { echo NPM_FAIL; tail -5 /tmp/n.log; exit 1; }
  fi
  cp /work/'"$SCRIPT"' /pw/run.mjs && cd /pw && node run.mjs'
