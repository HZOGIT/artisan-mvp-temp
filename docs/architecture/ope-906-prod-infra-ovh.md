# OPE-906 — Infra PROD OVH-centrée — proposition + diff vs staging

> **SPIKE — lecture seule, PAS d'implémentation.** Document soumis à **Awaiting Human
> Validation** (catégorie infra/archi/sécurité/DR). Aucun code écrit, aucun déploiement.
> Objectif : proposer l'infra de **production**, distincte de staging, **le plus possible sur
> OVHcloud** (souveraineté FR, cohérence RGPD + contexte e-invoicing FR), avec comme pièce
> maîtresse **PostgreSQL managée OVH**.

Statut : **proposition** — la décision GO/NO-GO et les arbitrages (notamment R1 ci-dessous)
relèvent de l'humain.

---

## 0. TL;DR / verdict

- **PostgreSQL managée OVH = faisable**, mais notre runner de provisioning (Option D, 2 rôles /
  2 URLs / FORCE RLS / role guard fail-closed) demande **3 adaptations ciblées** — toutes dues à
  l'**absence de superuser** sur l'admin OVH (`avnadmin` = `NOSUPERUSER … CREATEROLE`). Aucune
  n'est bloquante ; **R1 = la seule à valider avant tout** (cf. §2.1 et §6).
- **Backups/PITR managés OVH lèvent le gap DR 🔴 du prod-readiness ([OPE-897](ope-897-prod-readiness.md) §178)** —
  snapshots horaires + PITR jusqu'à 30 j selon le plan, restaurés depuis la console/API.
- **Backend** : recommandation = **Public Cloud Instance OVH** (région FR) + Docker, derrière le
  **Load Balancer OVH (TLS Let's Encrypt inclus)** → **remplace le CF Tunnel**. MKS = sur-dimensionné
  au stade actuel (cf. [OPE-877](ope-877-dispatch-concurrency-model.md)).
- **Frontend** : recommandation pragmatique = **garder CF Pages** (TLS+CDN gratuits, déjà câblé via
  push GitHub, bundle statique = **zéro donnée personnelle** → l'enjeu souveraineté est faible). OVH
  Object Storage est l'alternative « max OVH » mais **n'a pas de HTTPS natif** (exige un Load
  Balancer devant) → coût/complexité non justifiés pour du statique.
- **Données neuves** : prod démarre **vide** (provisioning au boot) → **pas de migration de
  données** (R5 quasi-nul).

---

## 1. Cartographie staging (base du diff)

| Brique | Staging (actuel) |
|---|---|
| **DB** | PostgreSQL **self-hosted Docker** (dev `5432`, déployé `5433`), rootless docker, owner `artisan_user` superuser de fait sur son cluster |
| **Provisioning** | Runner maison **Option D** au boot ([`provision-database.ts`](../../apps/api/shared/db/provision-database.ts)) sous `pg_advisory_lock` : `runMigrations()` (`.sql` triés par nom + ledger `__migrations`) → `ensureAppRole()` (crée `app_tenant`, grants) → `assertAppRoleExistsAndRestricted()` (fail-closed) |
| **Rôles / URLs** | `DATABASE_URL` = `artisan_user` (owner, provision, éphémère) ; `APP_DATABASE_URL` = `app_tenant` (`NOSUPERUSER NOBYPASSRLS`, RLS FORCE, pool runtime) |
| **Isolation** | RLS **FORCE** + policies tenant (`set_config('app.tenant', …, true)` **transaction-local**) + policies public-token |
| **Backend** | Docker, blue-green nginx (`new-stack-blue/green:3001`, ports 3011/3012) + **Cloudflare Tunnel** (`staging-backend.operioz.com`) ; `deploy-backend.sh` (rebuild + snapshot `pg_dump` best-effort + smoke) |
| **Frontend** | **CF Pages**, build auto sur push `staging`, dispatcher edge (`functions/_lib/dispatch.mjs`), `VITE_*` build-time via `wrangler pages secret` |
| **Secrets** | env Docker / `.env` serveur ; `wrangler pages secret` ; **jamais** dans `.env.production` |
| **Sizing / résilience** | Bricolage **swap 32GB / OOM** (cap 4 worktrees), rootless docker crash-loop boltdb — artefacts de la **factory d'agents**, pas du runtime prod |
| **Backups / DR** | `pg_dump` best-effort pré-déploiement, **non testé en restore** → **gap 🔴** ([OPE-897](ope-897-prod-readiness.md)) |

---

## 2. Proposition infra PROD OVH

### 2.1 DB = OVH **Managed PostgreSQL** (Public Cloud Databases, région FR) — pièce maîtresse

OVH Public Cloud Databases for PostgreSQL est un **service managé** (sur base Aiven). L'utilisateur
admin livré est **`avnadmin`**, avec exactement :

```
LOGIN NOSUPERUSER INHERIT CREATEDB CREATEROLE REPLICATION
```

→ **pas de superuser, pas de root** (limitation assumée du service managé). C'est le cœur de R1.

**Compatibilité avec notre runner Option D — point par point :**

| Étape du runner | OVH Managed PG | Verdict |
|---|---|---|
| `pg_advisory_lock` (sérialisation provision) | aucun privilège superuser requis | ✅ OK tel quel |
| `runMigrations()` — DDL schéma + index + CHECK + FK | DDL standard, owner = `avnadmin` | ✅ OK |
| `ENABLE / FORCE ROW LEVEL SECURITY` + `CREATE POLICY` | **un propriétaire de table non-superuser PEUT forcer la RLS sur SES tables** | ✅ OK **à condition** que le provisionneur soit l'**owner** des tables (cf. adaptation A1) |
| `ensureAppRole()` → `CREATE ROLE app_tenant LOGIN PASSWORD …` | `avnadmin` a **CREATEROLE** | ✅ OK |
| `ALTER ROLE app_tenant NOSUPERUSER NOBYPASSRLS` (role guard) | `SUPERUSER`/`BYPASSRLS` sont des **attributs réservés au superuser** → un `avnadmin` non-superuser **ne peut pas les positionner explicitement** | ⚠️ **A2 — adaptation requise** |
| `GRANT … ON ALL TABLES / SEQUENCES` + `ALTER DEFAULT PRIVILEGES` | owner peut grant sur ses objets | ✅ OK |
| `assertAppRoleExistsAndRestricted()` (lit `rolsuper`,`rolbypassrls`) | simple `SELECT` sur `pg_roles` ; un rôle créé par CREATEROLE est **NOSUPERUSER NOBYPASSRLS par défaut** | ✅ OK (le guard passe) |

**Adaptations nécessaires (toutes ciblées, aucune réécriture) :**

- **A1 — owner = `avnadmin`.** En prod, `DATABASE_URL` encode **`avnadmin`** (le provisionneur/owner).
  Les tables créées par les migrations sont donc **possédées par `avnadmin`**, ce qui l'autorise à
  `FORCE RLS` dessus. `APP_DATABASE_URL` = `app_tenant` créé par `avnadmin`. Notre modèle 2 rôles /
  2 URLs **tient** : `avnadmin` joue le rôle d'`artisan_user`. *(Vérifier que les objets créés en
  migration appartiennent bien à `avnadmin` et non à un rôle Aiven interne.)*
- **A2 — role guard.** `ALTER ROLE app_tenant NOSUPERUSER NOBYPASSRLS` (dans
  [`ensure-app-role.ts`](../../apps/api/shared/db/ensure-app-role.ts)) risque d'**échouer** sous
  `avnadmin` (attributs superuser-only). Or le rôle est **déjà** `NOSUPERUSER NOBYPASSRLS` par défaut
  (CREATEROLE ne confère pas ces bits). Adaptation : **rendre ce `ALTER` tolérant** (try/catch sur
  `insufficient_privilege` / le retirer quand owner non-superuser) **sans relâcher la sécurité** —
  le vrai garde-fou reste `assertAppRoleExistsAndRestricted()` au boot (lecture), qui **refuse de
  démarrer** si `app_tenant` peut bypasser la RLS. *(C'est l'inverse d'un affaiblissement : on
  s'appuie sur le défaut sûr + la vérif fail-closed.)*
- **A3 — `app_tenant` n'hérite pas des droits Aiven.** Avec `INHERIT` sur `avnadmin` et des rôles
  internes Aiven (`pg_*`), valider en recette que `app_tenant` **ne possède aucun** `BYPASSRLS`
  indirect (membership). Le test RLS sous `app_tenant` (ci-dessous) le prouve empiriquement.

> **Sécurité non négociable** : `app_tenant` ne doit **jamais** bypasser la RLS. A2 ne touche QUE
> l'émission d'un `ALTER` redondant ; le contrat fail-closed (`assertAppRoleExistsAndRestricted`)
> est **conservé tel quel** et reste la barrière dure.

**Connection pooling / connection limits.** Les plans managés OVH ont un **plafond de connexions**.
OVH fournit **PgBouncer** managé (modes **transaction / session / statement pooling**). Notre
`withTenant` pose `app.tenant` via `set_config(…, true)` = **transaction-local** → **compatible
transaction pooling** (le scope ne survit pas à la transaction, donc pas de fuite de GUC entre
clients). Recommandation : **transaction pooling**, `APP_DATABASE_URL` pointant sur l'endpoint
poolé ; garder le **provisioning** (`DATABASE_URL`/`avnadmin`) sur l'endpoint **direct** (advisory
lock + DDL hors pool).

**Backups / PITR (lève le gap DR 🔴 d'OPE-897).** OVH sauvegarde automatiquement : **snapshots
incrémentaux horaires** + backups 12/24 h, **rétention selon le plan** (Essential 2 j, Business
14 j, jusqu'à **30 j** sur les plans supérieurs), **PITR** (restauration à un instant T dans la
fenêtre) via console/API. → action OPE-897 « pg_dump quotidien + PITR + test de restore »
**couverte côté plateforme** ; reste à **tester une restauration avant go-live** (un backup non
restauré n'existe pas).

**Régions FR.** **Paris (3-AZ)**, **Gravelines (GRA)**, **Strasbourg (SBG)** — souveraineté FR /
RGPD. Paris 3-AZ apporte la **HA multi-AZ** pour les Managed Databases.

**Test obligatoire avant go-live (anti false-green, cf. CLAUDE.md) :** rejouer le provisioning
**contre une instance Managed PG OVH de recette**, puis un **test RLS sous `app_tenant`**
(`APP_DATABASE_URL`, jamais `avnadmin`) prouvant l'isolation tenant **réelle** (un tenant ne lit pas
les lignes d'un autre, `app_tenant` ne bypasse pas). Un test owner-bypass = mensonge.

### 2.2 Backend — hébergement OVH

| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **Public Cloud Instance** (+ Docker) | Facturation horaire, snapshots, scalable, s'intègre LB OVH + vRack + Object Storage, IaC | À administrer (OS, Docker) | ✅ **Recommandé** |
| **VPS** | Le moins cher, simple | Hors écosystème Public Cloud (pas de vRack natif, moins d'intégration LB/DB) | Acceptable si budget serré |
| **Managed Kubernetes (MKS)** | Ingress NGINX + cert-manager, HA, rolling | **Sur-dimensionné** : 1 backend mono-conteneur ne justifie pas K8s | ❌ Pas maintenant |
| **Webhosting** | — | Pas de conteneurs longs / WS / webhooks libres | ❌ Inadapté |

- **TLS / reverse proxy → remplace CF Tunnel** : **Load Balancer OVH** avec **certificat Let's
  Encrypt DV inclus** (terminaison TLS au LB, offload), OU `nginx`/Caddy + Let's Encrypt sur
  l'instance. → on **supprime la dépendance Cloudflare Tunnel** pour le backend public
  (`api.operioz.com`).
- **Sizing propre** : dimensionner l'instance (RAM/CPU) sur le **modèle de concurrence réel**
  ([OPE-877](ope-877-dispatch-concurrency-model.md)) — **abandonner le bricolage swap 32GB/OOM**, qui
  est un artefact de la **factory d'agents multi-screen**, pas du runtime backend (1 conteneur Node).
- Garder Docker + blue-green (réutilise `deploy-backend.sh`, adapter l'ingress).

### 2.3 Frontend — CF Pages vs OVH Object Storage

| Option | Verdict |
|---|---|
| **Garder CF Pages** | ✅ **Recommandé** : TLS + CDN global **gratuits**, build auto sur push, dispatcher edge déjà en place. Le bundle SPA est **statique et public, sans donnée personnelle** → l'enjeu souveraineté est marginal (≠ DB). |
| **OVH Object Storage + LB** | Alternative « max OVH » : S3-compatible, static website — **mais HTTPS non natif** (endpoint `http://…s3-website…`), exige un **Load Balancer OVH devant** pour le TLS custom-domain → +coût +complexité **non justifiés** pour du statique. À reconsidérer seulement si exigence contractuelle « 100% OVH ». |

> Arbitrage assumé : **souveraineté maximale sur la DB (donnée personnelle/fiscale)**, pragmatisme
> sur le statique. À trancher par l'humain si une clause impose 100% OVH.

### 2.4 DNS / TLS

- **OVH DNS** pour `operioz.com` (déjà chez OVH probable — à confirmer) : enregistrements
  `api.operioz.com` → LB/instance OVH ; frontend → CF Pages (CNAME) ou LB OVH selon §2.3.
- TLS : Let's Encrypt via LB OVH (backend) ; CF (frontend si CF Pages).

### 2.5 Secrets

- **Jamais** dans `.env.production` commité (règle CLAUDE.md — constantes publiques only).
- Backend : variables d'env Docker / fichier `.env` sur l'instance OVH (droits 600), ou **secrets
  managés** (Vault/OVH si introduit plus tard). `DATABASE_URL` (avnadmin), `APP_DATABASE_URL`
  (app_tenant), Stripe, Gemini → réutiliser les secrets legacy existants (cf. mémoire projet).
- Frontend : `VITE_*` build-time via `wrangler pages secret` (si CF Pages conservé).

### 2.6 Réseau / sécurité

- **Accès DB restreint** : OVH Managed PG permet une **IP allowlist** (« authorized IPs ») →
  n'autoriser que l'**IP de l'instance backend** (+ IP d'admin ponctuelle). Idéalement via **vRack**
  (réseau privé) entre instance et DB si dispo sur le plan.
- **Ingress webhook Stripe** : exposer `/webhooks/stripe` (Connect + bootstrap) en HTTPS public via
  le LB ; vérifier la **signature Stripe** (déjà en place côté code) ; ne PAS filtrer ces routes par
  IP allowlist (Stripe = IP variables) — la signature est la garde.
- Firewall instance : n'ouvrir que 443 (+ 22 restreint admin).

### 2.7 Observabilité / DR

- Logs **level ≥ warn**, alerting **ntfy** (déjà en place).
- **Backups DB = managés OVH + test de restore** (cf. §2.1) → ferme l'action 🔴 OPE-897.
- Health/smoke : réutiliser le smoke de `deploy-backend.sh` (health + auth).

---

## 3. Diff staging → prod + plan de cutover

| Brique | Staging | **Prod OVH (proposé)** |
|---|---|---|
| DB | PG Docker self-hosted (5433) | **OVH Managed PostgreSQL** (région FR, PITR, PgBouncer) |
| Owner provision | `artisan_user` (superuser de fait) | **`avnadmin`** (CREATEROLE, **non-superuser**) → adaptations A1–A3 |
| Backend ingress | **CF Tunnel** | **LB OVH + Let's Encrypt** sur Public Cloud Instance |
| Sizing | swap 32GB/OOM (factory) | instance dimensionnée (OPE-877) |
| Frontend | CF Pages | **CF Pages** (inchangé) |
| Backups | pg_dump best-effort | **PITR managé OVH + test restore** |
| Accès DB | local Docker | **IP allowlist / vRack** |
| Secrets | env Docker / wrangler | env instance OVH / wrangler (inchangé front) |

**Cutover (prod = base neuve, pas de migration de données) :**
1. Provisionner Managed PG OVH (région FR, plan avec PITR) + IP allowlist + pool.
2. **Recette R1** : rejouer le provisioning (A1–A3) sur une instance OVH jetable + **test RLS sous
   `app_tenant`** → valider GO/NO-GO de R1.
3. Provisionner Public Cloud Instance + Docker + LB OVH (TLS LE).
4. Poser les secrets (`DATABASE_URL`=avnadmin, `APP_DATABASE_URL`=app_tenant, Stripe, Gemini…).
5. Premier boot backend → provisioning au boot crée le schéma + RLS + `app_tenant` sur la DB managée.
6. **Test de restauration PITR** (un backup non restauré n'existe pas).
7. DNS `api.operioz.com` → LB OVH ; webhook Stripe re-pointé ; smoke (health+auth) + sweep navigateur.
8. Frontend : CF Pages prod (`VITE_*` → endpoint api.operioz.com).

**Rollback :** garder l'ancien chemin (staging/CF Tunnel) actif tant que le smoke prod n'est pas
vert ; bascule DNS = point de bascule réversible (TTL court). Pas de données prod à perdre tant que
go-live pas confirmé.

---

## 4. Risques

| # | Risque | Gravité | Mitigation |
|---|---|---|---|
| **R1** | **Privilèges OVH Managed PG (non-superuser) vs notre modèle rôles/RLS** | 🔴 **bloquant potentiel n°1** | Adaptations A1–A3 (§2.1) + **recette obligatoire** : provisioning + test RLS `app_tenant` sur instance OVH **avant** GO. **À valider en premier.** |
| R2 | Région / latence (DB ↔ backend) | 🟠 | Co-localiser instance + DB **même région FR** (Paris 3-AZ idéalement) ; vRack |
| R3 | Coûts (instance + DB managée + LB) | 🟠 | Estimer le plan DB (Essential/Business selon rétention PITR voulue) + instance + LB ; arbitrer rétention vs prix |
| R4 | Lock-in OVH/Aiven (spécificités managées) | 🟢 | PostgreSQL standard + Drizzle portable ; PITR/pool = features standard ; sortie = `pg_dump`/restore |
| R5 | Migration des données | 🟢 quasi-nul | **Prod neuve = vide**, provisioning au boot → rien à migrer |

---

## 5. Coûts (à chiffrer — ordres de grandeur à confirmer sur la grille OVH)

À estimer avant GO : **Managed PostgreSQL** (le plan conditionne la **rétention PITR** : Essential 2 j
↔ Business 14 j ↔ supérieur 30 j, + HA multi-AZ), **Public Cloud Instance** (RAM/CPU selon OPE-877),
**Load Balancer** (LE inclus), Object Storage (si retenu — sinon CF Pages = 0). *Chiffrage non
réalisé dans ce spike (lecture seule).*

---

## 6. Recommandation / prochaines étapes (sous validation humaine)

1. **VALIDER R1 EN PRIORITÉ** : POC provisioning Option D sur une **instance Managed PG OVH de
   recette** (adaptations A1–A3) + **test d'isolation RLS sous `app_tenant`**. C'est le **go/no-go**
   de toute l'architecture DB prod.
2. Si R1 OK → trancher backend (Public Cloud Instance recommandé), frontend (CF Pages recommandé),
   chiffrer (§5), puis dérouler le cutover (§3) — **chacune de ces décisions reste une porte
   `Awaiting Human Validation`** (infra/sécurité/billing).
3. NE PAS implémenter avant validation explicite.

---

## Sources

- [OVH Capabilities & Limitations — PostgreSQL (avnadmin, NOSUPERUSER, pas de superuser)](https://help.ovhcloud.com/csm/en-public-cloud-databases-postgresql-capabilities?id=kb_article_view&sysparm_article=KB0049315)
- [OVH — Migrer une base on-prem (remplacer le rôle superuser par avnadmin)](https://help.ovhcloud.com/csm/en-public-cloud-databases-postgresql-migrate-on-prem-to-pcd?id=kb_article_view&sysparm_article=KB0049464)
- [ovh/public-cloud-roadmap #551 — Providing SUPERUSER access (pas de superuser sur le managé)](https://github.com/ovh/public-cloud-roadmap/issues/551)
- [Terraform ovh_cloud_project_database_postgresql_user (gestion des rôles)](https://registry.terraform.io/providers/ovh/ovh/latest/docs/resources/cloud_project_database_postgresql_user)
- [OVH — Automated Backups for Public Cloud Databases (snapshots horaires, rétention par plan)](https://help.ovhcloud.com/csm/en-public-cloud-databases-backups?id=kb_article_view&sysparm_article=KB0048766)
- [OVH Blog — Major improvements: PITR pour PostgreSQL/MySQL/MongoDB](https://blog.ovhcloud.com/major-improvements-for-public-cloud-databases/)
- [OVH — Create and use connection pools (PgBouncer : transaction/session/statement)](https://help.ovhcloud.com/csm/en-public-cloud-databases-postgresql-pools?id=kb_article_view&sysparm_article=KB0049417)
- [OVH — Configure incoming connections (IP allowlist)](https://help.ovhcloud.com/csm/en-public-cloud-databases-postgresql-configure-instance?id=kb_article_view&sysparm_article=KB0049392)
- [OVH Multi-AZ — Paris 3-AZ, Managed Databases](https://www.ovhcloud.com/en/about-us/global-infrastructure/multi-az/)
- [OVH — Load Balancer sécurisé avec Let's Encrypt](https://docs.ovhcloud.com/en/guides/public-cloud/network-services/load-balancer-letsencrypt)
- [OVH — Managed Kubernetes + cert-manager / NGINX Ingress (TLS)](https://docs.ovhcloud.com/en/guides/public-cloud/containers-orchestration/managed-kubernetes/encrypt-secret-sealed-secrets-kubeseal)
- [OVH — Object Storage : héberger un site statique (endpoint http)](https://help.ovhcloud.com/csm/en-public-cloud-storage-s3-static-website?id=kb_article_view&sysparm_article=KB0058067)
- [OVH — Object Storage : HTTPS custom domain via Load Balancer](https://help.ovhcloud.com/csm/en-public-cloud-storage-s3-static-website-https?id=kb_article_view&sysparm_article=KB0058074)
