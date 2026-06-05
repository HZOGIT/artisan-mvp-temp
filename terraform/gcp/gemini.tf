# Enable required APIs
resource "google_project_service" "apikeys" {
  service            = "apikeys.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "generativelanguage" {
  service            = "generativelanguage.googleapis.com"
  disable_on_destroy = false
  depends_on         = [google_project_service.apikeys]
}

# Gemini API key — restricted to Generative Language API only
resource "google_apikeys_api_key" "gemini" {
  name         = var.gemini_api_key_display_name
  display_name = var.gemini_api_key_display_name

  restrictions {
    api_targets {
      service = "generativelanguage.googleapis.com"
    }
  }

  depends_on = [google_project_service.generativelanguage]
}
