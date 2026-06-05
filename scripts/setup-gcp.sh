#!/usr/bin/env bash
# =============================================================================
# setup-gcp.sh — Bootstrap GCP project + Gemini API key
#
# Prérequis :
#   - gcloud auth login --update-adc  (déjà fait)
#   - Un compte de facturation GCP actif (console.cloud.google.com/billing)
#
# Usage :
#   ./scripts/setup-gcp.sh
#   ./scripts/setup-gcp.sh --billing-account XXXXXX-XXXXXX-XXXXXX
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Couleurs ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
die()     { echo -e "${RED}[ERR]${NC}  $*" >&2; exit 1; }

# ── Config ───────────────────────────────────────────────────────────────────
PROJECT_ID="artisan-mvp-gemini"
PROJECT_NAME="Artisan MVP"
KEY_NAME="artisan-mvp-gemini-key"
ENV_FILE=".env.local"
ENV_MAIN=".env"

# ── Parse args ───────────────────────────────────────────────────────────────
BILLING_ACCOUNT=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --billing-account) BILLING_ACCOUNT="$2"; shift 2 ;;
    *) die "Argument inconnu: $1" ;;
  esac
done

# ── Vérif auth ───────────────────────────────────────────────────────────────
info "Vérification de l'authentification gcloud..."
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
[[ -z "$ACTIVE_ACCOUNT" ]] && die "Pas de compte actif. Lance: gcloud auth login --update-adc"
success "Connecté en tant que: $ACTIVE_ACCOUNT"

# ── Billing account ──────────────────────────────────────────────────────────
if [[ -z "$BILLING_ACCOUNT" ]]; then
  info "Recherche des comptes de facturation disponibles..."
  BILLING_LIST=$(gcloud billing accounts list --format="value(name,displayName,open)" 2>/dev/null || true)

  if [[ -z "$BILLING_LIST" ]]; then
    echo ""
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  Aucun compte de facturation trouvé.${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  1. Va sur https://console.cloud.google.com/billing"
    echo "  2. Clique 'Créer un compte de facturation'"
    echo "  3. Saisis ta CB et valide"
    echo "  4. Note l'ID (format: XXXXXX-XXXXXX-XXXXXX)"
    echo "  5. Relance: ./scripts/setup-gcp.sh --billing-account XXXXXX-XXXXXX-XXXXXX"
    echo ""
    exit 1
  fi

  # Prend le premier compte de facturation ouvert
  BILLING_ACCOUNT=$(gcloud billing accounts list \
    --filter="open=true" \
    --format="value(name)" 2>/dev/null | head -1 | sed 's|billingAccounts/||')

  [[ -z "$BILLING_ACCOUNT" ]] && die "Aucun compte de facturation actif trouvé."
  success "Compte de facturation: $BILLING_ACCOUNT"
fi

# ── Projet GCP ───────────────────────────────────────────────────────────────
info "Vérification du projet '$PROJECT_ID'..."
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  success "Projet '$PROJECT_ID' existe déjà."
else
  info "Création du projet '$PROJECT_ID'..."
  gcloud projects create "$PROJECT_ID" \
    --name="$PROJECT_NAME" \
    --quiet
  success "Projet '$PROJECT_ID' créé."
fi

gcloud config set project "$PROJECT_ID" --quiet
success "Projet actif: $PROJECT_ID"

# ── Liaison facturation ───────────────────────────────────────────────────────
info "Liaison du compte de facturation au projet..."
gcloud billing projects link "$PROJECT_ID" \
  --billing-account="$BILLING_ACCOUNT" \
  --quiet
success "Facturation liée."

# ── APIs ──────────────────────────────────────────────────────────────────────
info "Activation des APIs (peut prendre 30-60s)..."
gcloud services enable \
  apikeys.googleapis.com \
  generativelanguage.googleapis.com \
  --project="$PROJECT_ID" \
  --quiet
success "APIs activées."

# ── API Key ───────────────────────────────────────────────────────────────────
info "Création de la clé API Gemini..."

# Vérifie si une clé existe déjà avec ce nom
EXISTING_KEY=$(gcloud alpha services api-keys list \
  --project="$PROJECT_ID" \
  --filter="displayName=$KEY_NAME" \
  --format="value(name)" 2>/dev/null | head -1 || true)

if [[ -n "$EXISTING_KEY" ]]; then
  warn "Clé '$KEY_NAME' existe déjà — récupération..."
  GEMINI_KEY=$(gcloud alpha services api-keys get-key-string "$EXISTING_KEY" \
    --project="$PROJECT_ID" \
    --format="value(keyString)" 2>/dev/null)
else
  # Crée la clé restreinte à l'API Generative Language
  KEY_RESOURCE=$(gcloud alpha services api-keys create \
    --project="$PROJECT_ID" \
    --display-name="$KEY_NAME" \
    --api-target=service=generativelanguage.googleapis.com \
    --format="value(response.name)" 2>/dev/null)

  GEMINI_KEY=$(gcloud alpha services api-keys get-key-string "$KEY_RESOURCE" \
    --project="$PROJECT_ID" \
    --format="value(keyString)" 2>/dev/null)
fi

[[ -z "$GEMINI_KEY" ]] && die "Impossible de récupérer la clé API."
success "Clé API créée: ${GEMINI_KEY:0:8}...${GEMINI_KEY: -4}"

# ── Écriture dans .env.local ──────────────────────────────────────────────────
info "Mise à jour de $ENV_FILE..."

touch "$ENV_FILE"

# GEMINI_API_KEY
if grep -q "^GEMINI_API_KEY=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$GEMINI_KEY|" "$ENV_FILE"
else
  echo "GEMINI_API_KEY=$GEMINI_KEY" >> "$ENV_FILE"
fi

# GEMINI_LIVE_MODEL
if ! grep -q "^GEMINI_LIVE_MODEL=" "$ENV_FILE" 2>/dev/null; then
  echo "GEMINI_LIVE_MODEL=gemini-2.0-flash-live-001" >> "$ENV_FILE"
fi

# GCP_PROJECT_ID dans .env (pas .env.local)
touch "$ENV_MAIN"
if grep -q "^GCP_PROJECT_ID=" "$ENV_MAIN" 2>/dev/null; then
  sed -i "s|^GCP_PROJECT_ID=.*|GCP_PROJECT_ID=$PROJECT_ID|" "$ENV_MAIN"
else
  echo "GCP_PROJECT_ID=$PROJECT_ID" >> "$ENV_MAIN"
fi

# ── Résumé ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅  Setup GCP terminé${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Projet       : $PROJECT_ID"
echo "  Facturation  : $BILLING_ACCOUNT"
echo "  Clé Gemini   : ${GEMINI_KEY:0:8}...${GEMINI_KEY: -4} (écrite dans $ENV_FILE)"
echo "  Modèle Live  : gemini-2.0-flash-live-001"
echo ""
echo "  Prochaine étape : task gcp:init && task gcp:plan"
echo ""
