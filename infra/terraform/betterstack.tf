/** Uptime monitor — vérifie /health toutes les 60s, alerte après 2 échecs. */
resource "betteruptime_monitor" "api_health" {
  monitor_type       = "status"
  pronounceable_name = "Operioz API — /health"
  url                = "https://staging-backend.operioz.com/health"
  check_frequency    = 60
  recovery_period    = 120
  request_timeout    = 15
  email              = true
}

/** Heartbeat billing cron — le cron ping cette URL après chaque tick réussi. */
resource "betteruptime_heartbeat" "billing_cron" {
  name   = "Billing cron (hourly)"
  period = 3900
  grace  = 600
}

/** Heartbeat notifications cron — rappels factures + alertes stock (horaire). */
resource "betteruptime_heartbeat" "notifications_cron" {
  name   = "Notifications cron (hourly)"
  period = 3900
  grace  = 600
}
