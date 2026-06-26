#!/usr/bin/env bash
set -euo pipefail

# ─── Colours ────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

# ─── Paths ───────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Vars : terraform.tfvars (source UNIQUE, gitignoré) ───────────────────────
# Plus de dépendance à .env : tous les creds Terraform (cloudflare/betterstack/ovh)
# vivent dans infra/terraform/terraform.tfvars, chargé automatiquement par Terraform.
if [[ ! -f "$SCRIPT_DIR/terraform.tfvars" ]]; then
  echo -e "${RED}ERROR:${RESET} terraform.tfvars introuvable dans $SCRIPT_DIR"
  echo -e "${YELLOW}    Renseigne les creds (cloudflare_api_token, cloudflare_account_id, betterstack_api_token, ovh_*) dans ce fichier (gitignoré).${RESET}"
  exit 1
fi

# ─── Security scan ───────────────────────────────────────────────────────────
run_tfsec() {
  local mode="${1:-warn}"   # "warn" or "block"

  if ! command -v tfsec &>/dev/null; then
    echo -e "${YELLOW}⚠  tfsec not found — skipping security scan${RESET}"
    return 0
  fi

  echo -e "\n${CYAN}${BOLD}🔍 Running tfsec security scan...${RESET}"
  echo -e "${CYAN}────────────────────────────────────────────────────${RESET}\n"

  local tfsec_out
  tfsec_out=$(tfsec "$SCRIPT_DIR" --format lovely --no-colour 2>&1) || true

  local critical high
  critical=$(echo "$tfsec_out" | grep -c "CRITICAL" || true)
  high=$(echo "$tfsec_out"     | grep -c "HIGH"     || true)
  local total=$(( critical + high ))

  # Print full output with colours re-applied via tfsec's own formatter
  tfsec "$SCRIPT_DIR" --format lovely 2>&1 || true

  echo -e "\n${CYAN}────────────────────────────────────────────────────${RESET}"

  if [[ $total -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✅  No CRITICAL or HIGH issues found.${RESET}\n"
    return 0
  fi

  echo -e "${RED}${BOLD}🚨  Found ${critical} CRITICAL and ${high} HIGH issue(s).${RESET}"

  if [[ "$mode" == "block" ]]; then
    echo -e "${YELLOW}    Fix the issues above before applying, or re-run with:${RESET}"
    echo -e "${YELLOW}    TFSEC_SKIP_SECURITY=1 ./terraform/run.sh apply${RESET}\n"
    exit 1
  else
    echo -e "${YELLOW}    Review the issues above (non-blocking for plan).${RESET}\n"
  fi
}

# ─── Main ────────────────────────────────────────────────────────────────────
COMMAND="${1:-}"
cd "$SCRIPT_DIR"

case "$COMMAND" in
  plan)
    run_tfsec warn
    echo -e "${CYAN}${BOLD}📋 Running terraform plan...${RESET}\n"
    terraform plan "${@:2}"
    ;;
  apply)
    if [[ "${TFSEC_SKIP_SECURITY:-0}" == "1" ]]; then
      echo -e "${YELLOW}⚠  Security scan skipped (TFSEC_SKIP_SECURITY=1).${RESET}\n"
    else
      run_tfsec block
    fi
    echo -e "${CYAN}${BOLD}🚀 Running terraform apply...${RESET}\n"
    terraform apply "${@:2}"
    ;;
  scan)
    run_tfsec warn
    ;;
  *)
    terraform "$@"
    ;;
esac
