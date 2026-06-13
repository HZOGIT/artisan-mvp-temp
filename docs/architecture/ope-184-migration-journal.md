# OPE-184 — Journal de la migration clean archi (run autonome)

> Journal d'avancement de la run autonome. **Lu au début de chaque itération** pour reprendre l'état (survit aux résumés de contexte). Mis à jour à la fin de chaque itération.

## Configuration de la run (décidée le 2026-06-13)

- **Stratégie data** : **PG-first** — toute la data staging migrée vers PostgreSQL 18 une fois (itération 0/Phase 0) ; l'ancien stack Express ET le nouveau stack pointent sur le même PG. Pas de re-migration par domaine. **MySQL coupé tôt** (dès que l'ancien stack tourne sur PG, validé) ; **l'ancien serveur** s'éteint à la fin (dernier domaine migré).
- **Déploiement** : à chaque itération déployable → commit sur `staging`, `git push origin staging`, puis `task staging:deploy`. Cible : **staging uniquement** (`staging.operioz.com`), prod intouchée.
- **Politique d'échec** : si tests rouges / deploy KO / migration KO → **notifier + s'arrêter** (PAS de rollback auto, PAS de modif d'état). L'humain inspecte.
- **Cadence** : événementielle (reprise à la complétion du travail de fond) + **fallback 5 min / 300 s** (ScheduleWakeup) — demandé par l'humain le 2026-06-13.
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

### P0.3 (OPE-189) — conversion schéma batch 1 — EN COURS (sous-batchs)
Méthode : nouveau fichier **`drizzle/schema.pg.ts`** (pg-core) séparé du `schema.ts` mysql (legacy intact jusqu'au repoint P0.7). Gate code neuf = **`tsconfig.src.json`** (`pnpm exec tsc -p tsconfig.src.json`).
- [x] **3a** — rails + 6 tables fondatrices : enums (user_role, artisan_specialite, forme_juridique, client_type) + `users, permissions_utilisateur, artisans, clients, sessions, audit_log`. tsc gate **vert**. Pattern : serial (PK, copie ids OK), numeric, $onUpdate, pgEnum, noms de colonnes identiques.
- [x] **3b** — reste du batch 1 (cœur facturation, 13 tables) converti. **Batch 1 = 19 pgTable + 10 pgEnum.** Double validation : tsc gate vert + `drizzle-kit generate` (10 CREATE TYPE + 19 CREATE TABLE, DDL PG valide).

**P0.3 (OPE-189) = FAIT.**

### P0.4 (OPE-190) — batch 2 (compta + terrain) — EN COURS (sous-batchs)
- [x] **4a TERRAIN** — 11 tables : interventions, interventions_techniciens, techniciens, disponibilites/positions/objectifs/classement_techniciens, vehicules + historique_kilometrage/entretiens/assurances. +7 enums. **Cumul : 30 pgTable / 17 pgEnum.** tsc vert + DDL OK.
- [x] **4b COMPTA + CHANTIERS** — 10 tables (ecritures, plan_comptable, previsions_ca, historique_ca, chantiers, phases/interventions/documents_chantier, configurations/exports_comptables) + 11 enums. **Cumul : 40 pgTable / 28 pgEnum.** tsc vert + DDL OK.

**P0.4 (OPE-190) = FAIT** (batch 2 complet). Avancement conversion : **40 / 84 tables**.

### Prochaine action
→ **P0.5 (OPE-191) = FAIT** — conversion schéma **100 % : 89/89 tables, 67 enums** dans `drizzle/schema.pg.ts` (tsc gate vert + DDL `drizzle-kit generate` OK : 67 CREATE TYPE + 89 CREATE TABLE). Historique : 3a fait (15 tables : stocks, mouvements_stock, fournisseurs, sms_verifications, relances_devis, modeles_email, commandes_fournisseurs+lignes, paiements_stripe, client_portal_access/sessions, contrats_maintenance, factures_recurrentes, interventions_contrat, interventions_mobile). 3b fait (14 : activites, notifications, habilitations_techniciens, avis_clients, demandes_contact, demandes_avis, historique_deplacements, badges, badges_techniciens, config/historique_alertes_previsions, pointages_chantier, suivi_chantier, analyses_photos_chantier). **Cumul 69/89 tables, 20 restantes.** Continuer en **SOUS-BATCHS de ~10-12 tables/itération** (achats/stock : fournisseurs, commandes_fournisseurs, lignes_commandes_fournisseurs, stocks, mouvements_stock ; relation client : contrats_maintenance, factures_recurrentes, interventions_contrat, rdv_en_ligne, suivi_chantier, client_portal_*, avis_clients, demandes_avis, demandes_contact ; IA : conversations, messages, ai_threads, ai_messages, analyses_photos_chantier, photos_analyse, resultats_analyse_ia, suggestions_articles_ia, devis_genere_ia, photos_interventions ; plateforme : notifications, historique_notifications_push, push_subscriptions, preferences_notifications, preferences_couleurs_calendrier, modeles_email, badges, badges_techniciens, habilitations_techniciens, conges, soldes_conges, paiements_stripe, activites, pointages_chantier, historique_deplacements, sms_verifications, relances_devis, interventions_mobile, config_relances_auto, config_alertes_previsions, historique_alertes_previsions, rapports_personnalises, executions_rapports, integrations*). 

### ▶️ Prochaine action
→ **P0.6 (OPE-192)** : brancher `schema.pg.ts` comme source du dialect PG (drizzle.config : si `DB_DIALECT=postgresql`, `schema` doit pointer `./drizzle/schema.pg.ts`) et **générer la BASELINE migration PG dans `drizzle/pg/`** (out dédié, PAS `/tmp`, pour ne pas mélanger avec les migrations mysql legacy de `drizzle/`). Relire le SQL (89 tables / 67 types). Vérifier `drizzle-kit migrate` sur la PG dev (conteneur `postgres:18`, DATABASE_URL pg) → crée tout sans erreur. Puis P0.7 (repoint `getDb` → node-postgres), P0.8 (copie data), P0.9 (Vitest sur PG).
