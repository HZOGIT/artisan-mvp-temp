output "nameservers" {
  description = "Change these NS records at OVH ONLY after verifying all imported records in Cloudflare dashboard"
  value       = cloudflare_zone.operioz.name_servers
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

output "ovh_s3_access_key" {
  description = "OVH S3 access key ID — à injecter dans OVH_S3_ACCESS_KEY sur le serveur"
  value       = ovh_cloud_project_user_s3_credential.staging.access_key_id
  sensitive   = true
}

output "ovh_s3_secret_key" {
  description = "OVH S3 secret key — à injecter dans OVH_S3_SECRET_KEY sur le serveur"
  value       = ovh_cloud_project_user_s3_credential.staging.secret_access_key
  sensitive   = true
}
