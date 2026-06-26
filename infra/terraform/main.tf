terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    betteruptime = {
      source  = "BetterStackHQ/better-uptime"
      version = "~> 0.0"
    }
    logtail = {
      source  = "BetterStackHQ/logtail"
      version = "~> 0.0"
    }
    ovh = {
      source  = "ovh/ovh"
      version = "~> 1.0"
    }
  }
}

provider "ovh" {
  endpoint           = "ovh-eu"
  application_key    = var.ovh_application_key
  application_secret = var.ovh_application_secret
  consumer_key       = var.ovh_consumer_key
}

provider "betteruptime" {
  api_token = var.betterstack_api_token
}

provider "logtail" {
  api_token = var.betterstack_api_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
