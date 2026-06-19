# Session dédiée — rapatrier les migrations « script JS » dans le système de migrations Drizzle

## 🎯 Mission
Aujourd'hui, du **DDL structurel** (les policies RLS) est appliqué **hors du système de migrations Drizzle**, via des scripts JS lancés à la main. Conséquence : une **DB neuve** provisionnée uniquement par `drizzle-kit migrate` **n'a PAS la RLS** → faille de provisioning. Ta mission : **rapatrier ces "migrations JS" en migrations custom Drizzle**, pour que `drizzle-kit migrate` provisionne TOUT (schéma + RLS) en une chaîne unique, versionnée et traçée.

Tu travailles **par phases gatées**, commits chirurgicaux sur `staging`. **Ne fais que ça** — pas de dérive de scope.

---

## 🧱 Contexte projet (à connaître absolument)
- Stack **100% PostgreSQL** (le legacy MySQL a été supprimé). Backend clean-archi dans `apps/api/`, schéma source `drizzle/schema.pg.ts`.
- **drizzle-kit `0.31.4`**, **drizzle-orm `0.44.5`**, journal **v7**.
- `drizzle.config.ts` est **PG-only** : `schema: ./drizzle/schema.pg.ts`, `out: ./drizzle/pg`, `dialect: postgresql`.
- Migrations live : `drizzle/pg/NNNN_*.sql` (3 actuelles : 0000→0002) + `drizzle/pg/meta/_journal.json` (entries `idx/tag/when/breakpoints:true`) + snapshots.
- Application : `task db:migrate` = `DATABASE_URL=… DB_DIALECT=postgresql pnpm exec drizzle-kit generate && … migrate`.
- DB locale de dev : `DATABASE_URL=postgres://artisan_user:artisan_password@localhost:5432/artisan_mvp` (rôle owner `artisan_user`, rôle runtime tenant `app_tenant`, RLS active).

## 📂 État ACTUEL exact (ce qui est hors-migrations)
Tout est dans `scripts/rls/` :
1. **`generate-tenant-rls.mjs`** — *génère* `drizzle/rls/tenant-isolation.sql` (**320 lignes**) : introspecte toutes les tables portant une colonne tenant (`artisan_id`/`artisanId`) et émet les policies RLS multi-tenant. **Idempotent** (`DROP POLICY IF EXISTS` + `CREATE`). Policy = `nullif(current_setting('app.tenant', true), '')::int` (GUC vide hors transaction → deny).
2. **`apply-public-token.mjs`** — applique `drizzle/rls/public-token.sql` (**37 lignes**) : policies RLS du portail public (le token = la capacité). Idempotent. Lancé avec un rôle admin/superuser.
3. **`setup-app-role.mjs`** — `CREATE ROLE app_tenant` (login + **password depuis env**) + GRANTs : `connect`, `usage on schema public`, `select/insert/update/delete on all tables`, `usage/select on all sequences`, `ALTER DEFAULT PRIVILEGES … grant …`.

## ✅ Décisions DÉJÀ tranchées (ne pas re-débattre)
- **Option (b) générateur→migration** pour la RLS tenant : on **garde `generate-tenant-rls.mjs` comme outil dev**, mais on le fait **émettre une migration custom horodatée** dans `drizzle/pg/` (au lieu de `drizzle/rls/`). Avantage : conserve l'auto-coverage du schéma ; à chaque nouvelle table tenant on **régénère = nouvelle migration append** (jamais éditer une appliquée).
- **`setup-app-role.mjs` reste un BOOTSTRAP d'infra** (PAS une migration) : un mot de passe ne va pas dans une migration committée, et les GRANTs `ON ALL TABLES` sont point-in-time + couplés au rôle. Le rôle est de l'infra DB, pas du schéma applicatif. On documente l'ordre : **(1) bootstrap rôle → (2) `drizzle-kit migrate`**.
- Donc on **migre** : `tenant-isolation.sql` + `public-token.sql`. On **garde en bootstrap** : `setup-app-role.mjs`.

## 🛠️ Comment Drizzle gère les migrations custom (recherche faite)
- `DATABASE_URL=… DB_DIALECT=postgresql pnpm exec drizzle-kit generate --custom --name=<nom>` → crée un `.sql` **vide** dans `out` (= `drizzle/pg/NNNN_<nom>.sql`) **+ inscrit l'entrée dans `meta/_journal.json`**. Tu y colles ton SQL à la main.
- `drizzle-kit migrate` lit les `.sql`, compare à la table de suivi **`__drizzle_migrations`** (schéma `drizzle` par défaut en PG), applique les **pending** dans l'ordre `idx`. Custom + générées mixées par séquence.
- **Ne JAMAIS éditer une migration déjà appliquée** (hashée dans `__drizzle_migrations`). Corriger = nouvelle migration.
- `breakpoints: true` (ton défaut) insère `--> statement-breakpoint` ; en PG c'est une sécurité — garde-le.
- Le `migrate` doit se connecter en **owner/admin (`artisan_user`)** — déjà le cas — pour `ALTER TABLE … ENABLE RLS` + `CREATE POLICY`.

## ⚠️ Contraintes de sécurité (CRITIQUES)
- **NE JAMAIS perdre les data de staging.** On ne touche que des fichiers source ; jamais `DROP TABLE`/`TRUNCATE`.
- **DB existante (staging/local) a DÉJÀ la RLS** (posée par les scripts). La nouvelle migration custom sera **"pending"** → `migrate` la **rejouera**. Comme le SQL RLS est **idempotent** (`DROP POLICY IF EXISTS` + `CREATE`), c'est **SÛR**. Vérifie après coup que les policies sont intactes. (Drizzle n'a pas de "baseline mark-as-applied" propre → l'idempotence est le chemin.)
- Le **password du rôle reste hors-repo** (bootstrap/secret).

## 📋 Plan d'exécution (par phases, gate à chaque)
**P1 — RLS tenant-isolation → migration custom**
- `drizzle-kit generate --custom --name=rls-tenant-isolation` → colle le contenu de `drizzle/rls/tenant-isolation.sql` dans le `drizzle/pg/NNNN_rls-tenant-isolation.sql` vide.
- `drizzle-kit migrate` en local → vérifie 0 erreur + policies présentes (`select * from pg_policies;` ou `\d+ <table>`).

**P2 — RLS public-token → migration custom** (`--name=rls-public-token`, idem avec `public-token.sql`).

**P3 — Repointer le générateur (option b)**
- `generate-tenant-rls.mjs` : faire écrire vers une **nouvelle migration custom** (`drizzle/pg/`) + ajouter l'entrée `_journal.json`, au lieu de `drizzle/rls/tenant-isolation.sql`. (Ou, plus simple : il produit le SQL, toi tu fais `generate --custom` + colle.) Documente la procédure « schéma change → régénère → nouvelle migration ».
- **Supprime `apply-public-token.mjs`** (l'apply est désormais fait par `drizzle-kit migrate`).
- Garde `setup-app-role.mjs` (bootstrap).

**P4 — Câblage & doc**
- `Taskfile` : `db:migrate` applique déjà tout — vérifie qu'aucune étape RLS manuelle ne subsiste. Documente le **bootstrap** (`node scripts/rls/setup-app-role.mjs` puis `task db:migrate`).
- `CLAUDE.md` : section provisioning DB = (1) rôle bootstrap → (2) `drizzle-kit migrate` (schéma + RLS).
- Décide du sort de `drizzle/rls/` (les `.sql` deviennent des sources copiées dans les migrations → soit les garder comme source du générateur, soit les retirer une fois figés en migration ; documente).

**P5 — Vérif end-to-end**
- DB locale neuve (ou reset) : `setup-app-role` → `drizzle-kit migrate` → policies présentes.
- **`pnpm exec vitest run`** vert (≈2755 tests) — dont le **test d'isolation RLS** : `apps/api/interface/trpc/protected.test.ts` (et les routers L2 qui dépendent de `app.tenant`). C'est LE garde-fou : si la RLS casse, ils tombent.
- Sur **staging** : `drizzle-kit migrate` (rejoue la RLS idempotente) → re-tester l'isolation + smoke (`./scripts/smoke-staging-newstack.sh`).

## 🚦 Gates obligatoires (à CHAQUE phase)
- `pnpm exec tsc -p tsconfig.src.json --noEmit` → **0 erreur**.
- `pnpm exec vitest run` → vert (le test d'isolation prouve que la RLS marche).
- `drizzle-kit generate` (no-op attendu après) + `migrate` local OK.
- **Commit chirurgical** : `git add <chemins explicites>` — **JAMAIS** `git add -A`/`.`/`commit -a` (branche `staging` partagée). Pas de `OPE-XXX` dans le code (seulement les commits). Après push : `git fetch origin staging` + re-vérifier que ton commit est dans `origin/staging`.
- Pas de déploiement nécessaire pour un changement de migrations (sauf si tu touches `src`/runtime). Un `drizzle-kit migrate` sur staging applique le SQL — fais-le **explicitement et prudemment** (data-safety).

## 📣 Reporting
- ntfy à chaque phase : `./scripts/agents/ntfy-pub.sh "<titre>" "<message>"`.
- Tiens un mini-journal de la session (phases faites, décisions, vérifs).

## ▶️ Démarrage
Commence par **P1** : lis `drizzle/rls/tenant-isolation.sql` + `generate-tenant-rls.mjs`, génère la migration custom, applique en local, prouve que l'isolation tient (vitest), commit chirurgical. Puis enchaîne P2→P5. Si tu rencontres une ambiguïté de scope, **demande à l'humain** (`./scripts/agents/notify.sh human …`) plutôt que d'élargir.
