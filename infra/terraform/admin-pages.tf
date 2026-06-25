# Cloudflare Pages — projet admin staging (artisan-admin-staging).
# Branche source : staging (integration GitHub, meme repo que le front artisan).
# Commande build : pnpm build:admin ; dossier de sortie : dist/admin.
#
# Apres terraform apply, declencher un premier deploiement depuis le dashboard CF Pages
# (ou via wrangler) pour que la branche staging soit associee au projet.

resource "cloudflare_pages_project" "admin_staging" {
  account_id        = var.cloudflare_account_id
  name              = "artisan-admin-staging"
  production_branch = "staging"

  build_config = {
    build_command       = "pnpm build:admin"
    destination_dir     = "dist/admin"
    root_dir            = ""
  }

  source = {
    type = "github"
    config = {
      owner                         = "Operioz"
      repo_name                     = "artisan-mvp-temp"
      production_branch             = "staging"
      pr_comments_enabled           = false
      deployments_enabled           = true
      production_deployment_enabled = true
      preview_deployment_setting    = "none"
    }
  }
}
