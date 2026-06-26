variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare Account ID"
  type        = string
}

variable "access_allowed_emails" {
  description = "List of emails allowed through Cloudflare Access"
  type        = list(string)
  default     = ["dev@operioz.com"]
}

variable "betterstack_api_token" {
  description = "BetterStack global API token (Settings → API tokens)"
  type        = string
  sensitive   = true
}
