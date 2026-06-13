# OPE-184 — Journal de la migration clean archi (run autonome)

> Journal d'avancement de la run autonome. **Lu au début de chaque itération** pour reprendre l'état (survit aux résumés de contexte). Mis à jour à la fin de chaque itération.

## Configuration de la run (décidée le 2026-06-13)

- **Stratégie data** : **PG-first** — toute la data staging migrée vers PostgreSQL 18 une fois (itération 0/Phase 0) ; l'ancien stack Express ET le nouveau stack pointent sur le même PG. Pas de re-migration par domaine. **MySQL coupé tôt** (dès que l'ancien stack tourne sur PG, validé) ; **l'ancien serveur** s'éteint à la fin (dernier domaine migré).
- **Déploiement** : à chaque itération déployable → commit sur `staging`, `git push origin staging`, puis `task staging:deploy`. Cible : **staging uniquement** (`staging.operioz.com`), prod intouchée.
- **Politique d'échec** : si tests rouges / deploy KO / migration KO → **notifier + s'arrêter** (PAS de rollback auto, PAS de modif d'état). L'humain inspecte.
- **Cadence** : événementielle (reprise à la complétion du travail de fond) + **fallback ~10 min** (ScheduleWakeup).
- **Notification** : `curl https://ntfy.sh/operioz-claude-code-2026` (topic **PUBLIC** → aucune donnée sensible, seulement état/refs/liens). Helper : `devtools/agents/ntfy-pub.sh "<titre>" "<msg>" [tags]`.
- **DB cible** : PostgreSQL **18**. ORM : Drizzle (dialect `pg`). Tests : Vitest + PG18 jetable (Testcontainers).
- **Tests** : refonte des anciens tests sprint en tests alignés clean archi (unit par use-case + e2e sur PG18) au fil des domaines.

## Commandes utiles
- Notifier : `./devtools/agents/ntfy-pub.sh "Titre" "Message" tag`
- Déployer staging : `task staging:deploy`
- Migrations : `task db:migrate` / `task db:generate`
- Tests : `pnpm test`

## Plan de référence
- Proposition : `docs/architecture/ope-184-proposition-stack-cible.md`
- Plan détaillé + recette par domaine : `docs/architecture/ope-184-plan-migration-detaille.md`
- Issues Linear : Phase 0 = OPE-187→207 · Phase 1 vehicules = OPE-208→216 · epics OPE-217→240.

## Avancement

### Itération 0 — Phase 0 / socle (EN COURS)
- [x] **P0.1 / OPE-187** — Mapping des types MySQL→PG. Deliverable : `docs/architecture/ope-184-mapping-types-mysql-pg.md`. Constats clés : conversion mécanique ~95 % ; 71 enums + 32 `onUpdateNow` + 16 `onConflict` = l'effort réel ; **FK applicatives** (1 seule `references()`) → pas de contrainte FK à convertir, RLS d'autant plus important.
- [ ] **P0.2 / OPE-188** — pg + service postgres:18 dev + dialect pg (PROCHAINE).
- [ ] P0.3/4/5 — conversion schéma (3 batchs).
- [ ] P0.6 — baseline migration PG. P0.7 — repoint getDb + onConflict/date funcs. P0.8 — copie data.
- [ ] P0.9 — Vitest sur PG jetable. P0.10/11/12 — TenantContext + withTenant + RLS.
- [ ] P0.13 ports · P0.14/15 CI · P0.16 migrate hors boot · P0.17 gateway · P0.18 scaffold Fastify · P0.19 flags · P0.20 harnais isolation · P0.QW deps mortes.

### ▶️ STATUT : ACTIF — reprise 2026-06-13 ~06:10
**Gate qualité du loop (décidé)** : `pnpm test` vert + `tsc` scopé au code **NEUF `src/**` uniquement** (tsconfig dédié `tsconfig.src.json`, à créer en P0.18 quand `src/` existe). On **NE corrige PAS** les 672 erreurs tsc legacy (build réel = esbuild sans typecheck ; dette suivie via issue dédiée). Pour les itérations infra/legacy sans `src/`, le gate = pas de régression runtime + conteneurs healthy.

- **P0.2 (OPE-188)** : ✅ **fait** — `pg` 8.21 + `@types/pg`, service `postgres:18` up & **healthy** (PG 18.4), dialect Drizzle env-gated (`DB_DIALECT`, défaut mysql). Bonus : fixes baseline `trpc.ts` (narrowing user) + `routers.ts:10022` (z.record zod v4).
- **BLOCAGE (chiffre corrigé)** : `pnpm check` (tsc) renvoie **672 erreurs** sur `staging`, pré-existantes (premier rapport « 7 » erroné = troncature `tail -8`). Répartition : **561 dans `server/db.ts`** (dont **542× TS18047 « possibly null »** = pattern `getDb()` nullable non narrowé), 25 dans `routers.ts`, ~80 dans le front.
- **Cause racine** : le projet build via **esbuild** (`build:server`) qui **ne typecheck pas** → l'app tourne malgré les 672 erreurs ; `tsc --noEmit` n'a jamais été vert (pas de CI). Le gate « tsc vert sur tout le repo » est donc **irréaliste** comme préalable.
- Fixes déjà appliqués (corrects, à garder) : `trpc.ts` (narrowing user dans requireRole/requirePermission) + `routers.ts:10022` (z.record zod v4). Ils réduisent le total mais ne le rendent pas vert (legacy massif).

### Prochaine action
→ **P0.3 (OPE-189)** : conversion schéma Drizzle `mysqlTable`→`pgTable` batch 1 (plateforme + cœur facturation), en appliquant `ope-184-mapping-types-mysql-pg.md`. Rappel pièges : 71 enums → pgEnum, 32 onUpdateNow (gérer en repo / trigger), pas de FK à convertir.
