---
name: migrations
description: Schéma PostgreSQL du projet (Drizzle + RLS + pg-boss). À lire avant toute migration, changement de RLS, ou opération sur drizzle/ (générer, squasher, provisionner). Explique ce que drizzle-kit ne génère PAS (RLS/CHECK/index partiels) et la recette pour ces cas.
---

# Migrations & schéma (Drizzle + RLS + pg-boss)

Stack **100 % PostgreSQL**. Le schéma ET la sécurité niveau ligne (RLS) sont provisionnés par
**une seule chaîne de migrations Drizzle** appliquée **au boot** du serveur.

## 1. Où vivent les choses

```
drizzle/
  <timestamp>_<nom>.sql           # migrations (SQL appliqué au boot, triées par nom = ordre chronologique)
  meta/_journal.json              # index drizzle-kit (tag/idx/when) — cosmétique runtime depuis Option D
  meta/<timestamp>_snapshot.json  # snapshot du schéma TS après chaque migration (pour drizzle-kit diff)
  schema.pg.ts                    # point d'entrée du schéma TS (réexporte schema/*)
  schema/*.ts                     # pgTable : tables, colonnes, FK, index, enums
```

> ⚠️ Les migrations sont dans **`drizzle/`** (plus de sous-dossier `pg/` — squashé 2026-06-28).
> Config : `drizzle.config.ts` → `out: "./drizzle"`, `schema: "./drizzle/schema.pg.ts"`,
> `migrations.prefix: "timestamp"`. Si tu déplaces ce dossier, mets à jour **4** endroits :
> `drizzle.config.ts`, `apps/api/shared/db/run-migrations.ts` (`migrationsDir()`), `infra/Dockerfile`
> (`COPY --from=builder /app/drizzle ./drizzle`), `scripts/rls/generate-tenant-rls.mjs` (`PG_DIR`).

### Runner maison (Option D) — comment les migrations s'appliquent

> Détail exhaustif : `docs/architecture/migration-runner-option-d.md` §7.

Le serveur appelle `runMigrations(ownerPool)` (dans `apps/api/shared/db/run-migrations.ts`) :

1. Crée la table `__migrations` (filename + checksum SHA-256 + `applied_at`) si absente.
2. Lit tous les `.sql` de `migrationsDir()` (défaut `"drizzle"`, surchargeable via `MIGRATIONS_DIR`)
   triés par **nom** → ordre chronologique garanti par le timestamp dans le nom.
3. **Bascule unique depuis Drizzle** (BDD héritées 5432/5433) : si `drizzle.__drizzle_migrations`
   existe, inscrit au ledger les migrations dont le `when` (`_journal.json`) est ≤ au
   `max(created_at)` du ledger Drizzle — **sans ré-exécuter le SQL** (critère `folderMillis`,
   PAS le checksum). `_journal.json` est lu **uniquement** lors de cette bascule.
4. Pour chaque fichier absent du ledger : `BEGIN` → exécute le SQL → `INSERT __migrations` →
   `COMMIT` (connexion dédiée — atomique par fichier). Mode `-- no-transaction` disponible pour
   `CREATE INDEX CONCURRENTLY`.
5. Fichier déjà au ledger mais checksum divergent → **throw** (on ne réécrit jamais une migration
   appliquée).

**Collision entre worktrees résolue** : deux worktrees parallèles produisent
`20260628HHMMSSa_<nom>.sql` et `20260628HHMMSSb_<autre>.sql` — noms uniques → aucun conflit
git ni runtime. Si conflit textuel sur `_journal.json` au merge → résolution triviale (garder
les deux entrées) : `_journal.json` est cosmétique runtime, le runner n'en dépend pas.

## 2. Faire évoluer le schéma — `generate` = BROUILLON, revue manuelle OBLIGATOIRE

> 🔴 **Règle stricte** (BDD devenue grosse & complexe : beaucoup de tables, RLS, index, invariants).
> `drizzle-kit generate` produit un **brouillon indicatif**, **jamais** une migration finie. Le migrateur
> **DOIT relire le `.sql` généré ligne par ligne** et y **appliquer nos conventions manquantes** avant de
> committer. drizzle-kit ne voit que le schéma TS (cf. §3) → il **oublie systématiquement la RLS** et la
> plupart des index/CHECK. **Une migration générée non relue/complétée = à rejeter.**

1. Éditer `drizzle/schema/*.ts`.
2. Générer le brouillon :
   ```bash
   DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp \
     pnpm drizzle-kit generate --name=<nom>
   # → drizzle/<ts>_<nom>.sql + _journal.json + meta/<ts>_snapshot.json (ATOMIQUE)
   ```
3. **RELIRE & COMPLÉTER** le `.sql` généré — checklist conventions :
   - [ ] **RLS** — nouvelle table à `artisanId`/`artisan_id` ? → RLS tenant (`generate-tenant-rls.mjs`, §3a).
     Accès public par token ? → policy public-token (§3b). Table identité/journal global ? → denylist (RLS off).
     **drizzle ne génère JAMAIS la RLS.**
   - [ ] **Index** — colonnes FK indexées ? colonnes filtrées/triées (statut, dates, `WHERE deleted_at IS NULL`) ?
     index partiels là où ça compte ?
   - [ ] **CHECK** — colonnes texte type-enum (statuts), invariants métier (montants ≥ 0…) ?
   - [ ] **Sûreté données existantes** — `ADD CHECK/NOT NULL/UNIQUE` sec ? → `NOT VALID`/backfill (sinon crash-loop boot).
   - [ ] **FK** — `ON DELETE` correct (cascade / restrict / set null) ?
   Ce qui n'est pas auto-générable va dans une **migration custom** (`generate --custom`, §3) ou s'append au `.sql`.
4. Déployer : `./scripts/deploy-backend.sh`. Appliqué **au boot** (cf. §4).

**Règles dures**
- **Jamais** de `.sql` à la main ni d'édition manuelle de `_journal.json`/snapshot pour le cas auto —
  drizzle-kit gère idx/timestamp/journal/snapshot atomiquement. Migration sans snapshot ou sans entrée
  journal = cassé (la prochaine `generate` diverge ; le boot peut crash-looper).
- **Jamais** éditer une migration déjà appliquée → un changement = une **nouvelle** migration (append).
- `ADD COLUMN` nullable ou `DEFAULT … NOT NULL` (PG 11+) = sûr. `ADD CHECK/UNIQUE/NOT NULL` sec sur des
  données existantes peut **rejeter l'existant au boot** (fail-closed) → préférer `NOT VALID`/backfill.
- En session **worktree** : tout lancer **depuis le worktree** (`cd /tmp/wt-<nom>`), jamais le repo principal.
  Garde-fou : après `generate`, `git -C <repo-principal> status -- drizzle/` doit rester vide.

## 3. ⚠️ Ce que drizzle-kit NE génère PAS (le piège n°1) — migrations CUSTOM

`drizzle-kit generate` ne voit **que** le schéma TS (tables/colonnes/FK/index déclarés, enums). Il est
**aveugle** à tout le reste. Ces objets se gèrent en **SQL custom** :

| Objet | Recette |
|---|---|
| **RLS tenant** (policies + enable/force) | **`node scripts/rls/generate-tenant-rls.mjs`** : introspecte toutes les tables à `artisanId`/`artisan_id`, et **crée une migration custom seulement si l'ensemble a changé** (sinon no-op). |
| **RLS public-token** | Migration custom à la main (cf. §3b — le SQL canonique est ci-dessous). |
| **CHECK constraints** | `pnpm drizzle-kit generate --custom --name=<nom>` (fichier vide + journal + snapshot) → écrire le SQL. |
| **Index partiels** (`WHERE …`) | Déclarables en schéma (`index(...).where(sql\`…\`)` → alors générés) **OU** SQL custom. |
| **FK self-référentielles, triggers** | SQL custom. |

> **`generate --custom`** crée le `.sql` **vide** + l'entrée journal + le snapshot de façon atomique (le
> snapshot reflète le schéma TS, qui n'inclut pas ces objets → **pas de churn** aux générations futures).
> On remplit ensuite le SQL à la main. **C'est la voie normale et assumée** pour RLS/CHECK/index/triggers.

### 3a. RLS tenant — expression & convention
- Policy `tenant_isolation` : `<col> = nullif(current_setting('app.tenant', true), '')::int`
  (hors transaction la GUC revient à `''` → `null` → 0 ligne = **deny**). `USING` **et** `WITH CHECK`.
- `ENABLE` + **`FORCE` ROW LEVEL SECURITY** (force = même le propriétaire est soumis ; le runtime tourne en
  `app_tenant` non-superuser de toute façon). Gère les 2 conventions de colonne (`artisanId` / `artisan_id`).
- **Denylist** (RLS désactivée explicitement) : identité/auth/journaux globaux — `users`, `active_sessions`,
  `devices`, `subscriptions`, `events`, `event_outbox`, `billing_subscriptions`. (cf. le script.)
- ⚠️ **drizzle-kit ne sait PAS écrire la RLS** (ni `pgPolicy` schéma → il n'émet jamais `FORCE`). C'est
  pourquoi la RLS vit en SQL custom, pas dans le schéma TS. Choix assumé (2026-06-28).

### 3b. RLS public-token — SQL canonique (à recopier dans une migration custom pour évoluer)
Accès public en lecture seule via `current_setting('app.public_token')` (cf. `with-tenant.ts` → `withPublicToken`).
Pour **modifier** : éditer ce bloc, puis `generate --custom` et y coller le SQL (idempotent : `drop policy if exists`) :
```sql
drop policy if exists public_token_select on "demandes_avis";
create policy public_token_select on "demandes_avis" for select
  using ("tokenDemande" = nullif(current_setting('app.public_token', true), ''));
drop policy if exists public_token_select on "client_portal_access";
create policy public_token_select on "client_portal_access" for select
  using ("token" = nullif(current_setting('app.public_token', true), ''));
drop policy if exists public_token_select on "paiements_stripe";
create policy public_token_select on "paiements_stripe" for select
  using ("tokenPaiement" = nullif(current_setting('app.public_token', true), ''));
drop policy if exists public_token_select on "devis";
create policy public_token_select on "devis" for select
  using (exists (select 1 from "signatures_devis" s
    where s."devisId" = "devis".id
      and s."token" = nullif(current_setting('app.public_token', true), '')));
```

## 4. Application au boot (pas en CLI)

`apps/api/shared/db/provision-database.ts` exécute au démarrage, sous `pg_advisory_lock` (multi-réplicas) :
1. **`migrate()`** (SDK Drizzle, `run-migrations.ts`, `migrationsFolder = "drizzle"`) — schéma + RLS ;
2. **(ré)assure le rôle `app_tenant`** (non-superuser, GRANTs + `ALTER DEFAULT PRIVILEGES`) ;
3. **fail-closed** : refuse de démarrer si le rôle runtime est `rolsuper`/`rolbypassrls` (≠ vérifie FORCE).

**Deux rôles, deux URLs** (jamais croisées) :
- `DATABASE_URL` = `artisan_user` (**owner**) → provision (migrations + grants). Éphémère.
- `APP_DATABASE_URL` = `app_tenant` (**non-superuser, soumis RLS**) → pool runtime, toutes les requêtes.

**⚠️ Ne JAMAIS appliquer à la main** (`drizzle-kit migrate`, `psql`, `task stack:restart`). Déployer suffit.

**Décision de `migrate()`** (`drizzle-orm/pg-core/dialect.js`) : applique une migration **si
`created_at_du_dernier_enregistré < migration.folderMillis` (= `journal.when`)**. Décision par `created_at`,
**pas** par le hash (hash = `sha256` du `.sql`, stocké pour intégrité). C'est ce qui permet le squash (§6).

## 5. pg-boss — gère son schéma TOUT SEUL (hors Drizzle)

La file de jobs **pg-boss** n'est **pas** Drizzle. Dans `apps/api/server.ts` : `new PgBoss({ connectionString })`
puis `await boss.start()`. **`boss.start()` crée ET migre le schéma `pgboss`** (tables `job`, `schedule`,
`subscription`, `archive`, `queue`, `version`, l'enum `job_state`, fonctions/triggers) — pg-boss versionne
ses propres migrations dans `pgboss.version`. Aucun `schema:` custom passé → schéma **`pgboss`** par défaut.

**Conséquences**
- `pgboss.*` n'apparaît **jamais** dans les migrations Drizzle ni le baseline. Une base neuve (5432, CI)
  reçoit `pgboss` **quand l'app démarre** (le code), pas pendant `migrate()`.
- **Ne pas confondre** : `pgboss.*` (jobs, runtime, par pg-boss) ≠ `events`/`event_outbox` (outbox transactionnel
  **applicatif**, schéma `public`, **géré par Drizzle, dans le baseline**).
- En vérif/diff de schéma, **exclure pgboss** (`relname NOT LIKE 'pgboss%'`, enum `job_state`).

## 6. Squash / baseline (préserver les données d'une base déjà migrée)

Pas de `drizzle-kit squash` natif (juin 2026). Procédure manuelle (faite 2026-06-28 : 62 → 1 baseline),
**sans perdre les données** :

1. **Backups** : `pg_dump -Fc` de chaque base à préserver + copie de `drizzle/`.
2. **Baseline** : `rm` migrations+meta → `drizzle-kit generate --name=baseline` (1 fichier = tout le schéma TS).
3. **Réinjecter le SQL hors-schéma** (§3) : extraire de la **base vérité-terrain** (staging) la RLS
   (`pg_dump --schema-only` → `ENABLE/FORCE/CREATE POLICY` ; gérer les `CREATE POLICY` **multi-lignes** avec
   un awk qui accumule jusqu'au `;`), les CHECK, FK self-ref et index custom **absents** du baseline, et les
   **append** au `.sql` (séparés par `--> statement-breakpoint`). Piège : PK d'une table renommée
   (`audit_log`→`events` : ne pas appender `audit_log_pkey`, le baseline a déjà `events_pkey`).
4. **Valider l'identité** : appliquer le baseline sur une base **vide du même conteneur/version PG que la
   vérité terrain**, puis comparer **par counts** (pas par texte — la canonicalisation `ANY(ARRAY)` varie) :
   tables, colonnes, CHECK, FK, index (par nom), policies, RLS-forced, enums, séquences, triggers. Diffs
   tolérés : `pgboss`, lignée de rename (noms `*_pkey`/`*_id_seq`), **ordre des colonnes**.
5. **Réconcilier chaque base avec données** (sans re-run) :
   ```sql
   BEGIN;
   DELETE FROM drizzle.__drizzle_migrations;
   INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     VALUES ('<sha256 du baseline.sql>', <journal.when du baseline>);
   COMMIT;
   ```
   `created_at = journal.when` ⇒ `migrate()` voit le baseline « déjà appliqué » → jamais rejoué. **Astuce
   sûre** : laisser drizzle calculer le hash en provisionnant une base neuve, puis lire
   `SELECT hash FROM drizzle.__drizzle_migrations` (== `sha256sum baseline.sql`).
6. **Dry-run boot** : `provision-cli.ts` contre la base réconciliée → doit **no-op**, données intactes.
7. Commit (`drizzle/` + config + `infra/Dockerfile`) → deploy → revérifier data + 1 ligne migration.

> ⚠️ `docker exec` **sans `-i`** ne transmet pas un heredoc à stdin (psql tourne à vide). Utiliser
> `docker exec -i …` pour les heredocs SQL.

## 7. Vérif rapide d'une base (sanity / comparer deux bases)

```bash
# par counts (insensible au formatage) — répéter contre 5432 et 5433 :
docker exec <pg> psql -U artisan_user -d artisan_mvp -tAc \
 "SELECT count(*) FROM pg_class WHERE relkind='r' AND relnamespace='public'::regnamespace AND relname NOT LIKE 'pgboss%';"  # tables
docker exec <pg> psql -U artisan_user -d artisan_mvp -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public';"      # policies
# RLS active : app_tenant SANS GUC ne voit rien
docker exec <pg> psql -U app_tenant -d artisan_mvp -tAc "SELECT count(*) FROM clients;"  # → 0
```

**Bases** : **5432** = dev/test (`artisan-mvp-temp-postgres-1`) ; **5433** = déployé/staging
(`artisan-staging-postgres-1`). Toujours vérifier les migrations sur **5433** (déployé).

## 8. Migrer la BDD de test pour les tests (L2/L3/e2e) — `task db:provision`

Les tests L2 (repo Drizzle/RLS) et L3 (router e2e) tournent contre le **PG de test (5432)** en rôle
`app_tenant` + RLS. Quand un test casse en **`column "X" does not exist`** / **`relation … does not exist`**,
c'est la BDD de test **en retard de migrations** (pas le code). La remettre à niveau via le Taskfile :

```bash
task db:provision     # applique migrations (schéma + RLS) + (ré)assure app_tenant sur 5432 — MIROIR du boot
```
- `task db:provision` = exactement ce que fait le serveur au démarrage (`provision-cli.ts`), mais sur 5432.
  À lancer **avant de relancer les tests** dès qu'un schéma a évolué (nouvelle migration non encore appliquée
  en local) ou qu'un test L2/L3 échoue sur une colonne/table manquante. Idempotent.
- Autres tasks utiles : `task db:generate` (générer une migration depuis le schéma — ne touche PAS la base),
  `task db:seed` (user `dev@operioz.com`), `task db:shell` (psql).

**Reconstruire/aligner 5432 à neuf** (ex. dérive structurelle, après un squash) : `drop+create` la base sur
le conteneur dev → `task db:provision` (applique le baseline + crée `app_tenant`) → `pnpm exec tsx
scripts/seed-data.ts` pour les fixtures. Vérifier ensuite avec §7 (counts) + l'isolation RLS (`app_tenant`
sans GUC → 0 ligne).

> Les **e2e navigateur** (`scripts/staging-e2e-*.mjs` via `pw-run.sh`) tournent contre **staging
> (5433)**, déjà migré au boot — pas besoin de `db:provision` pour ceux-là. `db:provision` cible le **PG de
> test local (5432)** des gates L2/L3 `vitest`.
