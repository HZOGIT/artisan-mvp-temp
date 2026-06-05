output "nameservers" {
  description = "Change these NS records at OVH ONLY after verifying all imported records in Cloudflare dashboard"
  value       = cloudflare_zone.operioz.name_servers
}

output "dev_tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.dev.id
}

output "staging_tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.staging.id
}

# Connector token for `cloudflared tunnel run --token`. It is just a base64 of
# {account tag, tunnel id, tunnel secret} — the same shape as the dev token.
# Write it to .env.staging as CLOUDFLARE_TUNNEL_TOKEN_STAGING.
output "staging_tunnel_token" {
  sensitive = true
  value = base64encode(jsonencode({
    a = var.cloudflare_account_id
    t = cloudflare_zero_trust_tunnel_cloudflared.staging.id
    s = random_id.staging_tunnel_secret.b64_std
  }))
}
