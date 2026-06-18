variable "gcp_project_id" {
  description = "GCP project ID (e.g. artisan-mvp-123456)"
  type        = string
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "europe-west1"
}

variable "gcp_billing_account" {
  description = "GCP billing account ID (format: XXXXXX-XXXXXX-XXXXXX) — optional if project already exists"
  type        = string
  default     = ""
}

variable "gemini_api_key_display_name" {
  description = "Display name for the Gemini API key"
  type        = string
  default     = "artisan-mvp-gemini"
}
