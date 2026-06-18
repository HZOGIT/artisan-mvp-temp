#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Load env vars from repo root
if [ -f "../../.env" ]; then source "../../.env"; fi

export TF_VAR_gcp_project_id="${GCP_PROJECT_ID:?GCP_PROJECT_ID manquant dans .env}"
export TF_VAR_gcp_billing_account="${GCP_BILLING_ACCOUNT:-}"

CMD="${1:-plan}"

case "$CMD" in
  plan)
    terraform plan
    ;;
  apply)
    terraform apply -auto-approve
    # Extract API key and append to .env.local if not already set
    KEY=$(terraform output -raw gemini_api_key 2>/dev/null || true)
    if [ -n "$KEY" ]; then
      ENV_FILE="../../.env.local"
      if grep -q "^GEMINI_API_KEY=" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$KEY|" "$ENV_FILE"
      else
        echo "GEMINI_API_KEY=$KEY" >> "$ENV_FILE"
      fi
      echo "✅ GEMINI_API_KEY mis à jour dans .env.local"
    fi
    ;;
  output)
    terraform output -raw gemini_api_key
    ;;
  destroy)
    echo "⚠️  Destruction de l'infra GCP. Confirmer ? (yes/no)"
    read -r confirm
    [ "$confirm" = "yes" ] && terraform destroy
    ;;
  *)
    echo "Usage: $0 [plan|apply|output|destroy]"
    exit 1
    ;;
esac
