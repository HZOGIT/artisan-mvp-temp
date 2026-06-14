# Audit — Serving statique, graceful shutdown & healthcheck — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `serveStatic` (`server/_core/vite.ts`), fallback SPA, arrêt gracieux
> (`SIGTERM`), healthcheck conteneur (`docker-compose.staging.yml`).

---

## Conclusion : serving sûr. Écarts opérationnels = MEDIUM (pas de BLOCKER/HIGH).

### 1) ✅ Serving statique — pas de path traversal

- `express.static(distPath, { index:false, … })` : `express.static` **normalise** le chemin
  et **bloque `..`** → pas de lecture de fichier arbitraire hors `dist/public`.
- `/assets` servi avec cache long immuable (hash dans le nom).
- Fallback SPA `app.use("*", …)` → `res.sendFile(index.html)` (**fichier fixe**, pas de
  chemin dérivé de la requête) → pas de traversal, pas de shadowing des routes API
  (monté **après** tRPC et toutes les routes `/api/*`).
- Cache-Control correct (`no-store` sur `.html`, immuable sur `/assets`) — corrige le bug
  historique de chunks périmés post-déploiement.

*(Réserve LOW : tout fichier présent dans `dist/public` est public ; vérifier qu'aucune
source-map `.map` n'y est livrée en prod — info-leak mineur, hors périmètre secrets déjà
-ok.)*

### 2) 🟡 MEDIUM — pas d'arrêt gracieux (`SIGTERM`)

Aucun `process.on('SIGTERM'|'SIGINT')` + `server.close(drain)` (le seul `server.close()`
est dans `findAvailablePort`, `index.ts:24`, sans rapport). À chaque déploiement/restart,
le conteneur reçoit `SIGTERM` → Node **termine immédiatement** → requêtes HTTP et **flux
SSE** (assistant) en vol **coupés brutalement**, connexions DC du pool non drainées.

**Impact = MEDIUM** : déploiements peu fréquents + faible trafic au lancement + reconnexion
client/`cloudflared`. Les écritures schedulers sont **idempotentes** (déjà filé) → pas de
corruption sur coupure mi-tâche. Pas bloquant, mais à ajouter (drain + `server.close` puis
fermeture du pool sur `SIGTERM`).

### 3) 🟡 MEDIUM — healthcheck conteneur seulement sur MySQL, pas sur l'app

`docker-compose.staging.yml:23` : `healthcheck` = `mysqladmin ping` sur le service **MySQL**.
**Aucun** healthcheck sur le conteneur **backend**, et **aucun endpoint `/health`** côté
app. Le tunnel `cloudflared` forwarde donc vers l'app sans signal de readiness/liveness.

**Impact = MEDIUM (mitigé)** : en mono-instance + tunnel (pas d'orchestrateur routant sur
la santé), un app « up mais cassé » renverrait des 502 jusqu'au restart. Or, depuis
**OPE-82**, une DB morte **crashe** le process → `restart: unless-stopped` relance : le
crash *est* le mécanisme de recovery. Un `/health` (ping DB) + healthcheck conteneur
rendraient la détection propre, mais ce n'est pas bloquant. **Connexe à OPE-82
(résilience) et OPE-13 (observabilité)** → pas de nouvelle issue.

---

## Verdict

Serving statique **sans path traversal** (express.static + fallback fichier fixe). Manque
d'**arrêt gracieux** et de **healthcheck applicatif** = qualité opérationnelle **MEDIUM**,
sous le seuil BLOCKER/HIGH et **rattaché à OPE-82/OPE-13**. **Pas de nouvelle issue
Linear.**
