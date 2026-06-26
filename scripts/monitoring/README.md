# Monitoring Stack — Prometheus, Alertmanager, Grafana

## Accès (SSH tunnel)

Grafana est exposé uniquement en local (`127.0.0.1:3200`) pour raisons de sécurité.

### Accès depuis poste distant

```bash
ssh -L 3200:127.0.0.1:3200 staging
# Puis ouvrir http://localhost:3200 dans le navigateur
```

### Credentials

**Par défaut** (dev) :
```
Utilisateur: admin
Mot de passe: admin
```

**Staging** — exiger `GRAFANA_PASSWORD` dans `.env.staging` :
```bash
# .env.staging
GRAFANA_PASSWORD=<strong-password-here>
```

Si `GRAFANA_PASSWORD` est absent, docker-compose échoue (configuration fail-closed).

## Services de monitoring

| Service | Port (local) | Exposé? | Rôle |
|---------|--------------|---------|------|
| **Prometheus** | 9090 | Non | Scrape des métriques |
| **Alertmanager** | 9093 | Non | Gestion des alertes |
| **Grafana** | 3200 → 3000 | Non (SSH tunnel) | Visualisation dashboards |
| **Node Exporter** | - | Non | CPU/RAM/Disk de l'hôte |
| **cAdvisor** | - | Non | Métriques conteneurs Docker |

## Datasources & Dashboards

### Datasources

- **Prometheus** — auto-provisionné via `grafana/provisioning/datasources/prometheus.yml`

### Dashboards

- **Backend — Fastify** (`backend.json`) — HTTP requests, errors, latencies, Stripe/email metrics

## Prérequis

Avant de lancer le stack sur staging :

```bash
# 1. Créer ou regénérer une clé forte
GRAFANA_PASSWORD=$(openssl rand -base64 32)

# 2. Ajouter à .env.staging
echo "GRAFANA_PASSWORD=${GRAFANA_PASSWORD}" >> .env.staging

# 3. Lancer docker-compose
docker compose --env-file .env.staging up -d

# 4. Vérifier les logs
docker compose logs grafana
```

### Secrets sécurisés

- **Ne jamais commiter `GRAFANA_PASSWORD` dans le repo** — utiliser un gestionnaire de secrets (Vault, 1Password) ou le dashboard du service de déploiement.
