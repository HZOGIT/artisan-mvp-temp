resource "random_id" "staging_tunnel_secret" {
  byte_length = 35
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "staging" {
  account_id    = var.cloudflare_account_id
  name          = "artisan-staging"
  tunnel_secret = random_id.staging_tunnel_secret.b64_std
  config_src    = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "staging" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.staging.id

  config = {
    ingress = [
      {
        # Backend (Fastify, clean-archi) — UNIQUE backend depuis l'extinction du legacy.
        # Cible du proxy Pages Function (functions/api/[[path]].js) qui forwarde /api/* ici.
        # cloudflared tourne DANS le reseau compose et joint le service `new-stack` par son nom.
        # (Le front staging.operioz.com est servi par Cloudflare Pages, hors tunnel — cf dns.tf.)
        hostname = "staging-backend.operioz.com"
        service  = "http://new-stack:3001"
      },
      {
        service = "http_status:404"
      }
    ]
  }
}
