# Audit — Hygiène de déploiement (docker-compose staging) — MEDIUM-LOW

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `docker-compose.staging.yml` (services `app`, `mysql`, `cloudflared`).

---

## Conclusion : pas de BLOCKER/HIGH. Points d'hygiène à durcir pour la prod.

### Ce qui est correct

- **Migrations** : `pnpm exec drizzle-kit migrate` (pas `push`) → conforme au workflow
  (jamais `drizzle-kit push`). ✅
- **Secrets** : via `env_file: .env.staging` (variables d'env) — pas baked dans une image
  (pas de build d'image, `image: node:22-slim` + bind-mount). Le `cloudflared` lit le
  token via `${CLOUDFLARE_TUNNEL_TOKEN_STAGING}`. ✅
- **App non exposée directement** : pas de `ports:` sur `app` ; `cloudflared` l'atteint par
  le réseau compose interne (`app:3000`). ✅

### 🟡 Points d'hygiène (MEDIUM-LOW)

1. **L'app tourne en `root`** : `image: node:22-slim`, **aucun `user:`** → le process Node
   s'exécute **root** dans le conteneur. En cas de RCE/échappement, privilèges max. Reco :
   `user: "node"` (l'image `node` fournit un user `node` non-privilégié) + permissions du
   bind-mount adaptées.
2. **MySQL exposé sur le host** : `ports: "3307:3306"` (« pour debug ») avec mot de passe
   **par défaut faible** si l'env n'est pas posé (`${MYSQL_PASSWORD:-artisan_password}`,
   `${MYSQL_ROOT_PASSWORD:-stagingroot}`). Si l'hôte a une IP publique **sans firewall** et
   que les défauts sont utilisés → DB joignable d'Internet avec creds triviaux. Reco :
   **ne pas publier** le port en prod (ou bind `127.0.0.1:3307`), **forcer** des mots de
   passe forts (pas de défaut).
3. **Pas de healthcheck `app`** (seul `mysql` en a) → déjà noté (audit serving/healthcheck).
4. **Bind-mount `.:/app`** (code live du worktree, pas une image immuable) : pratique pour
   staging, mais pour la **prod** une **image buildée immuable** (+ `pnpm prune`) est plus
   sûre/reproductible.

→ Tout cela est **staging-scoped** et **conditionnel au host** (firewall, variables d'env
réellement posées dans `.env.staging`). **MEDIUM-LOW**, sous le seuil BLOCKER/HIGH.

---

## Reco de durcissement **avant lancement prod**

- `user: "node"` (non-root) sur le service app.
- Ne **pas** publier le port MySQL (ou `127.0.0.1` only) ; mots de passe forts **sans
  valeur par défaut** dans le compose.
- Healthcheck applicatif (`GET /` ou `/health`) sur `app`.
- Image immuable buildée pour la prod (vs bind-mount).
- `restart: unless-stopped` OK (déjà présent) — couplé aux filets process d'OPE-82.

---

## Verdict

Déploiement staging : migrations conformes, secrets en env, app non exposée directement.
Points d'hygiène **MEDIUM-LOW** (app en **root**, **MySQL publié** avec défauts faibles,
pas de healthcheck app, bind-mount) — **conditionnels au host**, staging-scoped, à
**durcir pour la prod**. **Pas de nouvelle issue Linear** ; reco de hardening documentée.
