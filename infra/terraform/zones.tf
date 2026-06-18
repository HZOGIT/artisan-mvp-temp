resource "cloudflare_zone" "operioz" {
  account = {
    id = var.cloudflare_account_id
  }
  name = "operioz.com"
  type = "full"
}
