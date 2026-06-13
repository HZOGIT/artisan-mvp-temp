output "gemini_api_key" {
  description = "Gemini API key — add to .env as GEMINI_API_KEY"
  value       = google_apikeys_api_key.gemini.key_string
  sensitive   = true
}

output "gemini_api_key_name" {
  description = "Full resource name of the API key (for rotation)"
  value       = google_apikeys_api_key.gemini.name
}
