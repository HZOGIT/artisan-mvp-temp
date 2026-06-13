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
→ **P0.6 (OPE-192) = FAIT** — drizzle.config branché (DB_DIALECT=postgresql → schema.pg.ts, out=drizzle/pg). Baseline `drizzle/pg/0000_pretty_puma.sql` générée (89 tables / 67 types) et **`drizzle-kit migrate` testé sur le conteneur postgres:18 (:5432) → 89 tables + 67 enums créés sans erreur** (vérifié psql). Commande de migration PG : `DB_DIALECT=postgresql DATABASE_URL=postgres://artisan_user:artisan_password@127.0.0.1:5432/artisan_mvp pnpm exec drizzle-kit migrate`.

### ▶️ P0.7 (OPE-193) — PARTIEL, REPRISE AUTORISÉE (décision prise : option a « harnais d'abord ») — 2026-06-13 ~07:34
**DÉCISION HUMAINE** : on garde PG-first. On NE grind PAS le SQL legacy en aveugle. **Nouveau séquencement** :
1. **P0.8 (OPE-194)** : copie data MySQL(:3306)→PG(:5432).
   - **P0.8a FAIT (dérive schéma)** : 3 tables live HORS Drizzle découvertes (`active_sessions`, `devices`, `subscriptions`) → modélisées en pgTable (snake_case, uniques composites), migration `drizzle/pg/0001` appliquée. **Schéma PG = 92 tables**. schema.active.ts régénéré (92).
   - **P0.8b FAIT** : `scripts/pg-data-copy.mjs` (ETL générique : coercition bool 0/1→bool + jsonb, `session_replication_role=replica` pendant le load, truncate idempotent, recalage séquences `setval`) + tâche `task pg:copy-data`. Exécuté sur dev → **comptes IDENTIQUES mysql↔pg** (clients 13/13, ai_messages 74/74, subscriptions 1/1, devis 3/3, permissions 28/28…), séquences OK (insert pg sans id ne collisionne pas). **→ P0.8 (OPE-194) = FAIT.**

### P0.9 (OPE-195) = FAIT — filet tourné sur PG + backlog produit
Tests db-direct sur PG : `fournisseurs.test.ts` **17/17 ✓**, `security.test.ts` **20/22** (les 2 échecs = **pollution data** « attendu 2 clients, obtenu 11 » car la PG contient les 13 clients copiés — **PAS** un bug pg). **→ Le chemin Drizzle/db-secure fonctionne sur PostgreSQL.** Les ruptures se limitent au SQL brut `getPool()` + `insertId`.

**Backlog port P0.7-suite — 75 fonctions db.ts** (mapping occurrence→fonction via node). Sous-batchs proposés, du moins au plus risqué :
- **7a — inserts `.returning()`** (~20 fn `create*` avec `insertId` mysql2 → ajouter `.returning({id})` puis lire `[0].id`) : createActivite, createContrat, createFactureRecurrente, createInterventionContrat, createRdvEnLigne, createClientPortalAccess, createMessage, createTechnicien, createHabilitationTechnicien, createPointageChantier, createHistoriqueDeplacement, createInterventionMobile, createPhotoIntervention, createNoteFrais, createDepense, getOrCreateAiThread, getOrCreateConversation, setDisponibilite, savePushSubscription, saveConfigAlertePrevision. **Mécanique, faible risque.**
- **7b — getPool raw, lectures simples** : couleurs calendrier (get/set/setMultiples/delete CouleurIntervention, getCouleursCalendrier), mobile/photos (getInterventionMobile*, getPhotos*), getStockEntrantByArtisan, getStatistiquesChantier, calculerBudgetsRealises, calculerClassement, initSoldeConges, invalidateCache.
- **7c — getPool raw, COMPTA/DÉPENSES (le gros bloc, ~30 fn, HAUT RISQUE financier)** : *Depense* (create/update/delete/get*/getNext/findDoublons/markOcr/CategorieDepense×4), *NoteFrais* (create/get/calculerTotal/soumettre/approuver/rejeter/payer/addDepense/removeDepense/getNext), genererFEC/exportDepensesFEC/genererExportFEC/genererExportIIF, getDeclarationTVADetail, getPendingItemsComptables, saveConfigurationComptable, lancerSynchronisationComptable.
- **7d — getPool raw, BANQUE/TRÉSO** : getTransactionsBancaires, getTresoreriePrevisionnelle, importReleve, ignorerTransaction, lierTransactionDepense.
- (`getPool` lui-même reste : le garder comme accès pg brut → fournir un `pgPool` quand DB_DIALECT=pg, ou réécrire en drizzle au cas par cas.)

**Méthode 7a→7d** : chaque sous-batch porté → re-run du filet (`security.test.ts`, `fournisseurs.test.ts` + tests du domaine) sur PG → vert avant commit. Pour **7c**, vigilance maximale (numérotation, écritures, TVA) ; valider via les benchmarks compta si dispo.

**Prochaine action : P0.7a** (inserts `.returning()`).
2. **P0.9 (OPE-195)** : faire tourner la suite de tests / db-secure sur PG → identifie précisément quelles fonctions raw-SQL cassent (les tests = discovery + filet).
3. **P0.7-suite** : porter les **~104 points** (73 `getPool()` raw mysql2 + 31 `insertId`) en **SOUS-BATCHS**, chacun **GATÉ par les tests sur vraies données** (détecte régressions financières). **NE PAS** marquer OPE-193 Done tant que l'app n'est pas fonctionnelle de bout en bout sur PG (tests verts).

**NB harnais P0.7** : pour gater le port, on réutilise **tel quel** le sous-ensemble des tests existants qui frappe la DB **directement** (db-secure/integration : `security.test.ts`, `tests/isolation-multi-tenant`, `fournisseurs.test.ts`… — **pas** les e2e `localhost:3000`, fragiles), comme **filet jetable**. La refonte des tests en clean-archi reste un chantier des phases 1+ (avec les nouveaux modules), pas P0.7.

**Fait & validé** : `server/db.ts` rendu dialect-aware (pool `pg`/node-postgres + import des tables via nouveau `drizzle/schema.active.ts` qui sélectionne schema.pg/schema selon DB_DIALECT). **L'app BOOTE sur PostgreSQL** (`pnpm dev` DB_DIALECT=postgresql → « Connected successfully (postgres) », serveur up) et le **chemin Drizzle SELECT fonctionne** (la requête de seed `getArtisan…` tourne sans erreur). Chemin mysql inchangé (défaut).

**Découverte BLOQUANTE pour finir P0.7** : le legacy ne se résume pas à Drizzle. Deux classes d'incompatibilité PG restent, sur du code qui manipule **factures / paiements / écritures comptables** :
1. **~73 appels `getPool()`** = usage **direct du pool mysql2 brut** + SQL **brut** (placeholders `?` vs `$1`, fonctions mysql, forme de résultat `[rows]`). En mode pg, `getPool()` renvoie null → endpoints `/api/articles/*` cassent (« Database unavailable »/500). Répartis : db.ts (60), routers.ts (5), index.ts (8).
2. **31 `insertId`** Drizzle (`result.insertId` mysql2 → nécessite `.returning()` en pg).

→ **~104 points de réécriture SQL legacy**, sur des données financières, avec une PG de test **vide** (impossible de valider le comportement tant que la data n'est pas copiée — P0.8). Mon gate « boote + read 200 » **ne détecte pas** une corruption subtile (numéro de séquence, onConflict, arrondi). **Risque d'intégrité → arrêt + escalade** plutôt que grind autonome.

**Décision prise = (a)** harnais d'abord (cf. séquencement ci-dessus). **Prochaine action immédiate : P0.8** (script de copie data MySQL→PG sur dev).

_Plan initial P0.7 (référence) :_ repointer `server/db.ts` `getDb()` du pool `mysql2` vers un pool `pg` + `drizzle(pool)` (drizzle-orm/node-postgres) quand DB_DIALECT=postgresql ; importer les tables depuis `schema.pg.ts` ; corriger les requêtes raw `sql\`\`` MySQL-spécifiques (16 onDuplicateKey → onConflictDoUpdate, CURDATE/DATE_FORMAT/DATE_ADD/IFNULL). ⚠️ C'est ici que ça devient DÉPLOYABLE et que le LEGACY (server/db.ts, gros volume, 561 err tsc) entre en jeu — itération potentiellement longue, découper si besoin (sous-batchs par groupe de fonctions). Puis P0.8 (copie data MySQL→PG), P0.9 (Vitest sur PG).
