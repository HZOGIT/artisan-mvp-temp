# staging records + misc records not picked up by the auto-scan.
# All other operioz.com records were auto-imported by Cloudflare and are NOT
# managed by Terraform (safe — Terraform won't touch them).
#
# Architecture staging (split front/back) :
#   staging.operioz.com          -> Cloudflare Pages (projet "artisan-staging",
#                                   gere via wrangler / API, hors Terraform)
#   staging-backend.operioz.com  -> tunnel artisan-staging -> app:3000 (API)

# Front : staging.operioz.com -> Cloudflare Pages (CNAME proxie vers le projet).
resource "cloudflare_dns_record" "staging_tunnel" {
  zone_id = cloudflare_zone.operioz.id
  name    = "staging"
  type    = "CNAME"
  content = "artisan-staging.pages.dev"
  proxied = true
  ttl     = 1
}

# Backend : staging-backend.operioz.com -> tunnel artisan-staging.
resource "cloudflare_dns_record" "staging_backend" {
  zone_id = cloudflare_zone.operioz.id
  name    = "staging-backend"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.staging.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}

# Nouveau stack clean-archi : staging-newstack.operioz.com -> tunnel artisan-staging
# (ingress -> new-stack:3001). Additif, n'affecte pas staging/-backend.
resource "cloudflare_dns_record" "staging_newstack" {
  zone_id = cloudflare_zone.operioz.id
  name    = "staging-newstack"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.staging.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "railway_verify_www" {
  zone_id = cloudflare_zone.operioz.id
  name    = "_railway-verify.www"
  type    = "TXT"
  content = "railway-verify=c2dc445831711d3807de10a30f1e5f48d26e60062d4ee556"
  proxied = false
  ttl     = 1
}

resource "cloudflare_dns_record" "google_workspace_verify" {
  zone_id = cloudflare_zone.operioz.id
  name    = "qwmvwb3wsiwc"
  type    = "CNAME"
  content = "gv-t64ewbq5mfcqaf.dv.googlehosted.com"
  proxied = false
  ttl     = 1
}
