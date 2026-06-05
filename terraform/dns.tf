# dev and staging tunnels + missing records not picked up by the auto-scan.
# All other operioz.com records were auto-imported by Cloudflare and are NOT
# managed by Terraform (safe — Terraform won't touch them).

resource "cloudflare_dns_record" "dev_tunnel" {
  zone_id = cloudflare_zone.operioz.id
  name    = "dev"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.dev.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
}

resource "cloudflare_dns_record" "staging_tunnel" {
  zone_id = cloudflare_zone.operioz.id
  name    = "staging"
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
