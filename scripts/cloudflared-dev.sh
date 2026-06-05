#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../.env"
exec /usr/bin/cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN_DEV"
