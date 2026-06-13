resource "random_id" "dev_tunnel_secret" {
  byte_length = 35
}

resource "random_id" "staging_tunnel_secret" {
  byte_length = 35
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "dev" {
  account_id    = var.cloudflare_account_id
  name          = "artisan-dev"
  tunnel_secret = random_id.dev_tunnel_secret.b64_std
  config_src    = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "staging" {
  account_id    = var.cloudflare_account_id
  name          = "artisan-staging"
  tunnel_secret = random_id.staging_tunnel_secret.b64_std
  config_src    = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "dev" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.dev.id

  config = {
    ingress = [
      {
        hostname = "dev.operioz.com"
        service  = "http://localhost:3000"
      },
      {
        service = "http_status:404"
      }
    ]
  }
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "staging" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.staging.id

  config = {
    ingress = [
      {
        # cloudflared runs INSIDE the artisan-staging compose network and
        # reaches the app by its service name (no host port needed).
        hostname = "staging.operioz.com"
        service  = "http://app:3000"
      },
      {
        service = "http_status:404"
      }
    ]
  }
}
