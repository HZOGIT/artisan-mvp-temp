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
        # staging.operioz.com pointe desormais vers Cloudflare Pages (cf dns.tf) ;
        # le tunnel ne recoit normalement plus ce trafic, on garde l'ingress en
        # fallback. cloudflared tourne DANS le reseau compose artisan-staging et
        # joint l'app par son nom de service.
        hostname = "staging.operioz.com"
        service  = "http://app:3000"
      },
      {
        # Backend API expose sur un hostname dedie : cible du proxy Pages Function
        # (functions/api/[[path]].js) qui forwarde /api/* ici.
        hostname = "staging-backend.operioz.com"
        service  = "http://app:3000"
      },
      {
        # Nouveau stack clean-archi (Fastify) expose sur un hostname dedie, A COTE
        # du legacy (additif, n'affecte pas staging/-backend). cloudflared joint le
        # service compose `new-stack` par son nom sur le reseau artisan-staging.
        hostname = "staging-newstack.operioz.com"
        service  = "http://new-stack:3001"
      },
      {
        service = "http_status:404"
      }
    ]
  }
}
