/** Uptime monitor — vérifie /health toutes les 60s, alerte après 3 min down. */
resource "betteruptime_monitor" "api_health" {
  monitor_type       = "status"
  pronounceable_name = "Operioz API — /health"
  url                = "https://staging-backend.operioz.com/health"
  check_frequency    = 60
  recovery_period    = 180
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

/** ID de la source de logs Node.js déjà configurée dans BetterStack. */
locals {
  log_source_id = "2531743"
}

/** Exploration : compte les log.fatal par fenêtre de 5 min. */
resource "logtail_exploration" "fatal_errors" {
  name            = "Fatal errors"
  date_range_from = "now-1h"
  date_range_to   = "now"

  chart {
    chart_type = "line_chart"
  }

  query {
    query_type      = "sql_expression"
    sql_query       = "SELECT {{time}} AS time, COUNT(*) AS count FROM {{source}} WHERE time BETWEEN {{start_time}} AND {{end_time}} AND level = 'fatal' GROUP BY time ORDER BY time ASC"
    source_variable = "source"
  }

  variable {
    name          = "source"
    variable_type = "source"
    values        = [local.log_source_id]
  }
}

/** Alerte : dès qu'un log.fatal apparaît → email immédiat. */
resource "logtail_exploration_alert" "fatal_any" {
  exploration_id = logtail_exploration.fatal_errors.id
  name           = "Fatal error detected"
  alert_type     = "threshold"
  operator       = "higher_than"
  value          = 0
  check_period   = 300
  query_period   = 300
  email          = true
}

/** Exploration : erreurs HTTP 5xx par fenêtre de 5 min. */
resource "logtail_exploration" "http_5xx" {
  name            = "HTTP 5xx errors"
  date_range_from = "now-1h"
  date_range_to   = "now"

  chart {
    chart_type = "line_chart"
  }

  query {
    query_type      = "sql_expression"
    sql_query       = "SELECT {{time}} AS time, COUNT(*) AS count FROM {{source}} WHERE time BETWEEN {{start_time}} AND {{end_time}} AND level = 'error' AND JSONExtractString(raw, 'event') LIKE '%http%' AND JSONExtractInt(raw, 'statusCode') >= 500 GROUP BY time ORDER BY time ASC"
    source_variable = "source"
  }

  variable {
    name          = "source"
    variable_type = "source"
    values        = [local.log_source_id]
  }
}

/** Alerte : plus de 5 erreurs 5xx sur 5 min → email. */
resource "logtail_exploration_alert" "http_5xx_spike" {
  exploration_id = logtail_exploration.http_5xx.id
  name           = "HTTP 5xx spike"
  alert_type     = "threshold"
  operator       = "higher_than"
  value          = 5
  check_period   = 300
  query_period   = 300
  email          = true
}
