resource "cloudflare_zero_trust_access_policy" "dev_allow" {
  account_id = var.cloudflare_account_id
  name       = "Allow dev team"
  decision   = "allow"
  include = [
    for email in var.access_allowed_emails : {
      email = { email = email }
    }
  ]
}

# NOTE: staging has NO Cloudflare Access — staging.operioz.com is intentionally
# PUBLIC. The Access policy/application for staging were removed on purpose.

resource "cloudflare_zero_trust_access_application" "dev" {
  zone_id          = cloudflare_zone.operioz.id
  name             = "Artisan Dev"
  domain           = "dev.operioz.com"
  type             = "self_hosted"
  session_duration = "24h"
  policies = [
    {
      id         = cloudflare_zero_trust_access_policy.dev_allow.id
      precedence = 1
    }
  ]
}

