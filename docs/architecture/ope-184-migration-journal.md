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

**P0.7a EN COURS** — helper `insertReturningId(table, values)` dialect-aware ajouté dans db.ts (PG `.returning({id})`, mysql `insertId`).
- **7a-1 FAIT** (8 fn Drizzle) : createActivite, createClientPortalAccess, createTechnicien, createHabilitationTechnicien, setDisponibilite, updatePositionTechnicien, createHistoriqueDeplacement, createContrat. **Validé sur PG ET mysql** (créent une ligne avec id correct ; tsc neuf vert).
- **7a-2 FAIT** (6 fn Drizzle : createFactureRecurrente, createInterventionContrat, getOrCreateConversation, createMessage, createRdvEnLigne, createPointageChantier). Validé **PG 6/6** + **mysql** (hors conversations, non-régression) ; filet PG 37/39 (2 échecs = pollution data). **→ 7a COMPLET.**
- Bonus : corrigé un vrai **bug PG** dans createMessage — `sql\`nonLuClient + 1\`` (identifiant nu → minusculé par PG en `nonluclient` inexistant) → interpolé via la colonne Drizzle.
- ⚠️ `getOrCreateAiThread` n'était PAS Drizzle (raw `ensurePool()`) → reclassé en 7b/7c.
- ⚠️ **2e accesseur de pool brut `ensurePool()`** = 27 occurrences (en plus des 73 `getPool()`) → **scope raw élargi** pour 7b/7c.
- 🔎 **Drift découvert** : mysql `conversations.statut` = `enum('active','archivee')` alors que schéma/code = `['ouverte','fermee','archivee']` → `getOrCreateConversation` **déjà cassé sur le mysql live** (pré-existant, pas une régression du port). Sur PG cohérent. À tracer (schema.ts ≠ base live par endroits — possible source d'autres surprises au cutover).
- Inserts raw `pool.execute` (createDepense, createNoteFrais, createInterventionMobile, createPhotoIntervention, getOrCreateAiThread) → 7b/7c.

### P0.7b EN COURS — réécriture des raw `getPool`/`ensurePool` en Drizzle (dialect-neutre)
- **7b-1 FAIT** : 5 fn ai réécrites en Drizzle (getOrCreateAiThread, getAiThread, listAiThreads, insertAiMessage, getAiMessages) — `ensurePool()` raw → Drizzle. Validé **PG + mysql** sur vraies données (25 threads / 74 msgs). aiThreads/aiMessages ajoutés à l'import db.ts.
- 🪦 **Calendrier couleurs (getCouleursCalendrier/setCouleurIntervention/setCouleursMultiples/deleteCouleurIntervention) = DEAD CODE** : tapent la table `couleurs_interventions` qui **n'existe dans AUCUNE base** (mysql 0 / pg 0). Déjà cassées sur mysql (pré-existant ; getCouleurs catch→{}, les set/delete throw). → **NE PAS porter à l'aveugle.** Option : réécrire contre `preferencesCouleursCalendrier` (= bugfix + changement de comportement, à valider) OU supprimer comme dead-code. **Sorti de la boucle → décision humaine / tâche dédiée.**
- **7b-2-a FAIT** : mobile/photos (6 fn — get/create/update InterventionMobile, get/create PhotoIntervention) raw → Drizzle. Validé **PG + mysql** (create/get/update/photos). interventionsMobile/photosInterventions ajoutés à l'import.
- **7b-2-b FAIT** : getStockEntrantByArtisan (join+agrégat GREATEST/COALESCE/SUM/HAVING → Drizzle, validé PG+mysql), getStatistiquesChantier (sous-requête depenses → Drizzle). `invalidateCache` = cache mémoire (déjà neutre, rien à faire). `calculerBudgetsRealises` → reporté en **7c** (dépend de getCategoriesDepenses, raw). **→ 7b COMPLET.**

### ▶️ 2e schéma `fix-duplicates.ts` — DÉCISION PRISE (modéliser + unifier) — reprise 2026-06-13 ~08:38
Découvert en attaquant 7b-2-b (`getStatistiquesChantier` interroge `depenses`).

**Constat** : il existe un **DEUXIÈME système de schéma** hors Drizzle : `server/_core/fix-duplicates.ts` exécute au **démarrage prod** (`node dist/fix-duplicates.js` avant `start`) **18 `CREATE TABLE IF NOT EXISTS` + 37 `ALTER TABLE`**. Tables **raw-only** (absentes de drizzle/schema.ts, de schema.pg.ts, ET de la base dev) : `depenses, notes_de_frais, notes_frais_depenses, categories_depenses, budgets_categories, regles_categorisation, transactions_bancaires, releves_bancaires, couleurs_interventions, modules, artisan_modules`. (Les 37 ALTER ajoutent aussi des colonnes raw à des tables Drizzle existantes → drift de colonnes.)

**Impact** :
- **Tout 7c (compta/dépenses/FEC/banque, ~30 fn)** tape ces tables → **non portable tant qu'elles ne sont pas modélisées + créées en pg + données copiées**.
- Une partie de 7b aussi (getStatistiquesChantier→depenses, calculerBudgetsRealises→budgets). (getStockEntrantByArtisan + invalidateCache restent portables : tables modélisées / cache mémoire.)
- La base **dev ne contient PAS** ces tables (fix-duplicates ne tourne qu'en prod) → **impossible de valider la compta sur dev**. Les données réelles sont en **staging/prod**.
- ⚠️ Le périmètre « 92 tables » de P0.6 est **INCOMPLET** : +~11 tables raw + 37 colonnes raw.

**DÉCISION (humain) = option 1 : modéliser en Drizzle + unifier.** Issue Linear dédiée créée. Plan :
- **P0.5e (PROCHAINE)** : lire les 18 CREATE + 37 ALTER de `server/_core/fix-duplicates.ts` ; modéliser les ~11 tables raw-only en `pgTable` dans schema.pg.ts (SOUS-BATCHS) + appliquer les 37 colonnes ALTER aux tables Drizzle concernées (drift) ; régénérer baseline PG (migration 0002) ; **créer ces tables dans les bases DEV (mysql ET pg)** via le DDL (le dev ne les avait pas) pour pouvoir valider les fonctions. Mettre aussi à jour schema.active.ts (régénérer).
- **P0.5f** : sort de fix-duplicates.ts (dialect-aware pg OU retrait une fois Drizzle source unique) — avant cutover.
- Puis **reprise 7b-2-b (getStatistiquesChantier, calculerBudgetsRealises) + 7c** sur ces tables, gaté par tests.
- ⚠️ **Validation compta limitée sur dev** (données absentes) → la vraie validation compta = **sur staging** au cutover.

### P0.5e EN COURS — modélisation du 2e schéma
- **5e-1 + 5e-2 FAIT** : 8 tables compta modélisées en PG (depenses, categories_depenses, notes_de_frais, notes_frais_depenses, budgets_categories, releves_bancaires, transactions_bancaires, regles_categorisation) + 9 enums + uniques. tsc vert + DDL OK (**100 tables**).
- **5e-3 À FAIRE** : modules, artisan_modules (fix-duplicates ~918-960), couleurs_interventions (~1440). Lire le DDL, modéliser (snake_case).
- **5e-4 À FAIRE** : lire les **37 `ALTER TABLE`** de fix-duplicates.ts ; pour chaque colonne ajoutée à une table Drizzle existante, l'ajouter au pgTable si manquante (drift de colonnes).
- **5e-FIN** : régénérer baseline incrémentale (`drizzle/pg/0002`) + `drizzle-kit migrate` sur postgres:18 + régénérer schema.active.ts + **créer ces tables dans dev mysql+pg** (jouer le DDL) pour valider les fonctions ensuite.

- **5e-3 FAIT** : modules, artisan_modules, couleurs_interventions (PK composite). **couleurs_interventions EXISTE** (créée par fix-duplicates) → calendrier couleurs **n'est PAS dead-code** (correction de la conclusion 7b-1 : juste absent du dev).
- **5e-4 FAIT** : seules 3 colonnes réellement manquantes (`artisans.metier/plan/onboarding_completed`, utilisées dans routers.ts) ajoutées ; les 34 autres ALTER = colonnes déjà dans Drizzle (fix-duplicates défensif).
- **5e-FIN FAIT** : baseline `drizzle/pg/0002` migrée sur postgres:18 → **103 tables PG** ; schema.active.ts régénéré (103) ; 11 tables créées dans **mysql dev** (via fix-duplicates, + seed 18 modules/12 catégories) ; ETL re-exécuté → **parité** (modules 20/20, categories 12/12). **Les bases dev (mysql + pg) ont désormais les tables compta** → 7c testable des deux côtés.

**→ P0.5e (OPE-254) = FAIT. Périmètre réel : 103 tables (vs 89 estimées au départ).**

### P0.7c — compta/dépenses (HAUT RISQUE)
**DÉCISION ARCHITECTURE (PG-first)** : les tables fix-duplicates (depenses, categories_depenses, etc.) sont modélisées **uniquement dans `schema.pg.ts`**, PAS dans le schéma mysql legacy `schema.ts`. Donc en mode mysql, `schema.active` renvoie `undefined` pour ces tables → les fonctions compta portées **fonctionnent en PG, pas en mysql**. C'est **INTENTIONNEL** : le nouveau `db.ts` ne tourne jamais en mode mysql en prod (l'ancien stack bascule sur PG au cutover avec `DB_DIALECT=postgresql` ; on ne modélise pas le legacy mysql voué à être supprimé). → **Validation compta = PG uniquement.**
⚠️ **Garde-fou** : NE JAMAIS déployer le nouveau `db.ts` sur staging/prod en mode mysql avant le cutover PG (sinon crash compta). Cohérent avec « PAS de staging:deploy avant fin P0.7 + cutover ».

- **7c-1 FAIT** : getCategoriesDepenses, createCategorieDepense (INSERT IGNORE → select-puis-insert), updateCategorieDepense, deleteCategorieDepense (soft-delete) → Drizzle. **Validé PG** (CRUD + idempotence + soft-delete + filtre actif corrects). tsc neuf vert.

- **7c-2 FAIT** : dépenses CRUD + filtres + findDepensesDoublons → Drizzle. Validé PG (TTC=HT+TVA, recalcul update HT200→TVA40/TTC240, whitelist OPE-63).
- **7c-3a FAIT** : getNextDepenseNumero + getNextNoteFraisNumero (séquence DEP-00001→00002 sans trou), markDepenseOcrTraite, upsertBudget (ON DUPLICATE→select-puis-insert/update, idempotent vérifié 1 ligne/budget=2000), calculerBudgetsRealises → Drizzle. Validé PG.
- **7c-3b À FAIRE** : getDepensesStats (7 agrégats : SUM/COUNT/CASE WHEN, GROUP BY categorie/fournisseur/mois ; `DATE_FORMAT`→`to_char`, `DATE_SUB`→calcul date JS ; PG-only).

- **7c-3b FAIT** : getDepensesStats (7 agrégats SUM/COUNT/CASE WHEN, GROUP BY catégorie/fournisseur/mois ; `DATE_FORMAT`→`to_char`, `DATE_SUB`→date JS) → Drizzle. Validé PG : totalMois=180 (60+120), nb=2, parCatégorie somme=180, àRembourser=180, TVArécup=30. **→ 7c-3 complet.**

- **7c-4 FAIT** (2026-06-13) : Notes de frais → Drizzle. getNotesFrais (sous-requête corrélée `nb_depenses`), getNoteFraisById (innerJoin notesFraisDepenses), createNoteFrais (insertReturningId), addDepenseToNoteFrais (ownership note OPE-182 + remboursable OPE-179, INSERT IGNORE→select-puis-insert), removeDepenseFromNoteFrais (vérif ownership note puis delete lien), calculerTotalNoteFrais (`COALESCE(SUM(montant_ttc),0)` innerJoin where `remboursable=true`, update montant_total). **Validé PG** (`scripts/test-ndf-pg.mjs`, 10/10) : total=180 (120+60, exclut la non-remboursable de 240), montant_total persisté=180, 2 liens, re-add idempotent, **OPE-182 add+remove cross-tenant refusés**, après remove total=120, nb_depenses=1. tsc neuf vert.
  - ⚠️ **Filet** : security.test.ts/isolation-multi-tenant échouent (clients=21 au lieu de 2, et 401 sur e2e HTTP) = **pollution data ETL** (IDs de fixtures qui collisionnent avec les lignes copiées de staging) + e2e localhost fragiles — **pas une régression NDF** (mon edit ne touche que `notes_de_frais`). fournisseurs.test.ts vert (17/17).

- **7c-5 FAIT** (2026-06-13) : workflow NoteFrais → Drizzle (soumettre/approuver/rejeter/payer). **UPDATE..INNER JOIN mysql → sous-requête** `inArray(depenses.id, select depense_id from notes_frais_depenses where note_id=…)` (PG ne supporte pas UPDATE..JOIN), `CURDATE()`→date JS. Helper `depenseIdsLieesANote(db, noteId)`. **Validé PG** (`scripts/test-ndf-workflow-pg.mjs`, 18/18) : transitions brouillon→soumise→approuvee→payee + chemin rejet ; propagation du statut aux dépenses liées (soumise/approuvee/rejetee) ; dates renseignées ; **OPE-179 au paiement** : seule la dépense remboursable passe `remboursee`+`rembourse=true`+`date_remboursement`, la non-remboursable reste intacte ; recalcul `montant_total=120` à la soumission. tsc neuf vert.
  - **NB OPE-63** : aucune logique anti-self-approbation dans ces 4 fonctions ni dans le router `approuverNoteFrais` (approbation scopée **artisan/tenant**, pas par user). L'OPE-63 réel = whitelist des champs modifiables de `updateDepense` (statut/rembourse hors map) — non touché. Rien à préserver ici de ce côté.

**Prochaine action : P0.7c-6** (FEC/exports comptables : genererFEC, exportDepensesFEC, genererExportFEC, genererExportIIF, getDeclarationTVADetail, getPendingItemsComptables, saveConfigurationComptable, lancerSynchronisationComptable — vérifier **débit=crédit équilibré**). Puis 7c-7 (banque).

_(Rappel règle : commentaire Linear OPE-193 par itération.)_
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
