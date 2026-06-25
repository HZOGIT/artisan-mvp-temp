# Cloudflare Pages — projet admin staging (artisan-admin-staging).
# Branche source : staging (integration GitHub, meme repo que le front artisan).
# Commande build : pnpm build:admin ; dossier de sortie : dist/admin.
#
# La SPA admin appelle le backend en cross-origin via VITE_API_URL (le proxy same-origin
# est obsolete). Apres terraform apply, declencher un premier deploiement (push staging
# ou `wrangler pages deployment create`) pour que CF build la branche staging.

resource "cloudflare_pages_project" "admin_staging" {
  account_id        = var.cloudflare_account_id
  name              = "artisan-admin-staging"
  production_branch = "staging"

  build_config = {
    build_command   = "pnpm build:admin"
    destination_dir = "dist/admin"
    root_dir        = ""
  }

  deployment_configs = {
    production = {
      env_vars = {
        VITE_API_URL = {
          type  = "plain_text"
          value = "https://staging-backend.operioz.com"
        }
      }
    }
    preview = {
      env_vars = {
        VITE_API_URL = {
          type  = "plain_text"
          value = "https://staging-backend.operioz.com"
        }
      }
    }
  }

  source = {
    type = "github"
    config = {
      owner                         = "HZOGIT"
      repo_name                     = "artisan-mvp-temp"
      production_branch             = "staging"
      pr_comments_enabled           = false
      deployments_enabled           = true
      production_deployment_enabled = true
      preview_deployment_setting    = "none"
    }
  }
}

# Domaine public de l'admin (le DNS CNAME admin-staging -> *.pages.dev est dans dns.tf).
resource "cloudflare_pages_domain" "admin_staging" {
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.admin_staging.name
  name         = "admin-staging.operioz.com"
}
