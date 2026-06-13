# Journal — Refonte clean-archi (post-migration PG)

> Source de vérité du **cron itératif** de la refonte. À lire au début de CHAQUE itération
> pour récupérer la **Prochaine action**, puis l'exécuter, gater, tracer (4 canaux), et
> mettre à jour ce fichier. Survit à la compaction de contexte.

## Directive de persistance (IMPORTANT)
**Ne PAS s'arrêter tant que la refonte n'est pas parachevée** (Phase 0 → phases 1-5 → extinction de l'ancien stack). Le cron itératif enchaîne les sous-tâches d'itération en itération jusqu'au bout — ne pas arrêter la boucle sur un simple jalon atteint, ne pas demander de confirmation pour avancer. **Seule exception** : problème d'intégrité financière/sécurité **irréparable** révélé par un test → STOP + ntfy ALERT. Ne supprimer le cron qu'à complétion réelle (ou demande explicite de l'utilisateur).

## Décisions verrouillées
- **Framework serveur cible = Fastify** (choisi 2026-06-13, vs Hono). Le nouveau stack se scaffolde en Fastify (`src/app.ts` + adapter tRPC + `/health`), adapté progressivement derrière le gateway/flag. tRPC conservé, Drizzle (node-postgres).

## Convention de code (IMPORTANT)
- **Pas de références ticket `OPE-XXX` dans les commentaires de code** — seulement dans les messages de commit (et ce journal/docs). Cleanup du legacy = carte OPE-255 (backlog).
- Code neuf clean-archi dans **`src/**`** (gate : `pnpm exec tsc -p tsconfig.src.json`). Le legacy (`server/`, `client/`) garde sa dette tsc (hors scope).

## Plan de référence
- `docs/architecture/ope-184-plan-migration-detaille.md` (recette par domaine + tableau Phase 0 + phases 1-5).
- `docs/architecture/ope-184-proposition-stack-cible.md` (stack cible : Fastify + tRPC + Drizzle pg + clean-archi + RLS).
- Projet Linear : « Refonte progressive de la stack et de l'architecture ».

## Recette par domaine (checklist de chaque epic phases 1→5)
1. Cartographier le domaine (entités, invariants, effets de bord). 2. Définir le **port** `I<Domaine>Repository` (chaque méthode exige le `TenantContext`). 3. Repo **Drizzle** (filtre artisanId + `withTenant()` RLS). 4. **Use-cases** (logique métier pure, ports injectés). 5. Tests unit (use-cases mockés) + intégration (repo sur PG jetable) + isolation cross-tenant. 6. Adapter tRPC (`<domaine>.*`). 7. Câbler le **gateway** derrière un flag (off par défaut). 8. Parité/canary → bascule du flag → on.

## Gate par itération
- `pnpm exec tsc -p tsconfig.src.json` vert (code neuf).
- Tests du code neuf verts (Vitest, PG jetable quand applicable).
- Pour les domaines sensibles : préserver les invariants métier (facturation, TVA, FEC débit=crédit, isolation cross-tenant, anti self-approbation, etc.).

## Règle de traçabilité (4 canaux, par itération réussie)
1. **git** : commit + push `staging` (JAMAIS CLAUDE.md ni terraform/*). 2. **journal** : MAJ ce fichier (Prochaine action). 3. **ntfy** : `devtools/agents/ntfy-pub.sh "titre" "msg" "tag"` (channel operioz-claude-code-2026). 4. **Linear** : `save_comment` sur l'issue active du sous-batch (ou l'issue Phase 0 concernée). STOP + ntfy ALERT seulement sur un problème d'intégrité (financier/sécurité) irréparable.

---

## État de départ (2026-06-13)
- **Migration MySQL→PG TERMINÉE** (OPE-193 Done) : code 100% Drizzle dialect-aware, schéma PG 103 tables, data staging copiée+intègre, app staging **live sur PostgreSQL**, mysql arrêté. C'est le socle data de la refonte.
- **Phase 0 issues 0.1–0.9 = FAITES** (toute la bascule DB).
- **`src/**` n'existe pas encore** (aucun code clean-archi). `tsconfig.src.json` prêt (include `src/**` + schema.pg.ts).

## Découpage de la suite (cibles)
- **Phase 0 kernel/socle (0.10–0.20 + QW)** : TenantContext (0.10), withTenant() RLS (0.11), migration RLS policies (0.12), ports effets de bord Email/Sms/Storage/Pdf (0.13), CI lint+typecheck (0.14), CI vitest+PG (0.15), sortir migrations du boot (0.16), gateway flag (0.17), scaffold Fastify src/app.ts + /health (0.18), feature flags (0.19), harnais isolation cross-tenant (0.20), quick-win deps mortes (QW).
- **Phases 1→5** (epics par domaine, recette ci-dessus) : 1=pilotes (vehicules, badges, support, avis, geoloc), 2=référentiels (clients, articles, fournisseurs, stocks, parametres), 3=cœur transactionnel (devis, factures, contrats, comptabilité, commandes-fourn), 4=terrain/temps réel (interventions, chantiers, rdv, notifs-push, assistant-ia SSE), 5=plateforme/bascule (stripe, users-permissions, auth+révocation, scheduler, extinction ancien stack).

## Issues Linear Phase 0 (existent déjà)
0.10=OPE-196, 0.11=OPE-197 (withTenant), 0.12=OPE-198 (RLS, Urgent), 0.20=OPE-206 (harnais isolation, Urgent). Phase 1 vehicules gabarit = OPE-208→216.

## Avancement
- **R0.10 (OPE-196) FAIT** (2026-06-13) : shared kernel `src/shared/tenant/`. `TenantContext` (artisanId, userId, role?) + `TokenClaims` (userId, email) + port `TenantResolver` (resolve(claims)→TenantContext, l'adapter Drizzle DB viendra avec withTenant/repos) + erreurs `UnauthenticatedError`/`MissingTenantError`. `verifyAuthToken(token, secret)` jose HS256 **secret injecté** (pur, testable, **découplé du legacy** — pas d'import auth-simple) + `extractTokenFromCookieHeader`. **Choix clean-archi** : le kernel ne dépend PAS du legacy ; la résolution `artisanId`/permissions depuis la DB est un **port** (adapter implémenté plus tard côté infra). Gate : `tsc -p tsconfig.src.json` vert + **12/12 tests** (`src/shared/tenant/jwt.test.ts`). vitest.config étendu à `src/**/*.test.ts`.

- **R0.11 (OPE-197) FAIT** (2026-06-13) : `src/shared/db/`. `client.ts` : `createDbClient(connStr)` (drizzle node-postgres + pg Pool, injectable) + `getDbHandle()` (défaut lazy via DATABASE_URL). `with-tenant.ts` : `withTenant(db, ctx, fn)` ouvre une transaction Drizzle, `set_config('app.tenant', <artisanId>, true)` (valeur en **paramètre lié**, anti-injection), exécute `fn(tx)` ; + `dbForTenant(ctx, fn)` (client défaut) que les repos utiliseront. **Validé PG** (`with-tenant.test.ts`, 4/4) : `app.tenant` positionné dans la tx (=artisanId), **local à la tx** (revient à vide après, pas de fuite), 2 tenants successifs isolés (11/22), propagation du résultat. tsc src vert.
  - ⚠️ **Note pour R0.12 (RLS)** : `current_setting('app.tenant', true)` revient à **`''` (chaîne vide)** hors transaction (pas null). Les policies RLS doivent utiliser **`nullif(current_setting('app.tenant', true), '')::int`** (sinon `''::int` plante). Vide → 0 ligne (deny).

- **R0.12a (OPE-198, en cours) FAIT** (2026-06-13) : **mécanisme RLS prouvé + SQL généré pour les 64 tables tenant**. ⚠️ **Découverte bloquante** : le rôle `artisan_user` est **SUPERUSER + BYPASSRLS** → il ignore totalement RLS. Conséquence : (a) RLS n'a d'effet que via un **rôle applicatif NON-superuser** (à créer pour le nouveau stack) ; (b) **avantage dual-stack** : appliquer RLS aux tables est **safe pour le legacy** (il bypasse en superuser → non impacté), seul le nouveau stack (rôle dédié) sera contraint.
  - `scripts/rls/generate-tenant-rls.mjs` : interroge information_schema, émet `drizzle/rls/tenant-isolation.sql` — pour chaque table tenant : `ENABLE` + `FORCE ROW LEVEL SECURITY` + policy `tenant_isolation USING/WITH CHECK (<col> = nullif(current_setting('app.tenant', true), '')::int)`. Gère les **2 conventions de colonne** (`artisan_id` snake / `artisanId` camel). Idempotent (DROP POLICY IF EXISTS). 64 tables.
  - **Validé PG** (`src/shared/db/rls.test.ts`, 1/1) via un **rôle non-superuser** de démo : sans tenant → 0 ligne, tenant 1 → ses 2 lignes, tenant 2 → sa 1 ligne, reset → 0 ; le **superuser bypasse** (voit les 3). tsc src vert.
  - **NON appliqué aux vraies tables** (dev/staging) : c'est R0.12b.

- **R0.12b (OPE-198) FAIT** (2026-06-13, RLS = Done) : **rôle app non-superuser + RLS appliquée + nouveau stack câblé**.
  - `scripts/rls/setup-app-role.mjs` : crée/configure le rôle LOGIN **`app_tenant`** (nosuperuser, **nobypassrls**), grants `connect/usage/select,insert,update,delete on all tables` + `usage,select on sequences` + default privileges. Idempotent. (Vérifié : superuser=false, bypassrls=false.)
  - **DENYLIST** ajoutée au générateur : `users`, `active_sessions`, `devices`, `subscriptions` **exclues** de la RLS tenant (lues hors contexte tenant : auth, session, device, webhook Stripe par customerId — sinon le nouveau stack ne pourrait plus authentifier/résoudre le tenant/traiter les webhooks). Le SQL **désactive** explicitement la RLS sur ces 4 tables. → **60 tables** sous RLS, 4 exclues.
  - **Appliqué sur dev PG** : 60 tables `rowsecurity=true`, les 4 exclues `false`. (Legacy dev = superuser → bypasse → non impacté.)
  - **`client.ts`** : `getDbHandle()` préfère **`APP_DATABASE_URL`** (rôle app non-superuser, soumis RLS) puis `DATABASE_URL`. Le legacy garde `DATABASE_URL` (superuser, bypasse).
  - **Validé PG** (`src/shared/db/rls-real-table.test.ts`, + suite `src/shared` 18/18) : sur la vraie table **`clients`** via le rôle app + `withTenant` → tenant A voit ses 2 clients, B voit son 1 ; **hors withTenant → 0** (deny) ; le **superuser voit les 3** (app live non impactée). tsc src vert.
  - ⚠️ **Reste pour le cutover du nouveau stack** (pas maintenant) : (a) créer le rôle `app_tenant` + appliquer `tenant-isolation.sql` **sur staging PG** (deploy, safe car superuser bypasse) ; (b) définir `APP_DATABASE_URL` (rôle app_tenant) dans l'env du nouveau stack. À faire quand le nouveau stack Fastify sera déployé derrière le gateway.

## Prochaine action : **R0.20 — Harnais d'isolation cross-tenant (OPE-206, Urgent)**
Généraliser `server/tests/isolation-multi-tenant.test.ts` en un helper réutilisable dans `src/shared/testing/` : `expectCrossTenantDenied(caller, { idTenantB })` — pour une route/use-case « par id », appelé en tant que tenant A sur une ressource de B → attend NOT_FOUND/FORBIDDEN. Fixtures multi-tenant **sans IDs codés en dur**. C'est le filet qui aurait empêché les IDOR + sera réutilisé par chaque domaine (phases 1-5). Gate `tsc src` + démonstration sur 1 cas (ex. un faux repo/use-case ou la RLS clients). Pas de `OPE-XXX` en code. Puis 4 canaux → R0.13 (ports effets de bord) / R0.18 (scaffold Fastify) / poursuite Phase 0. (Note : R0.13 ports effets de bord, R0.14-15 CI, R0.16 migrations hors boot, R0.17 gateway, R0.18 scaffold Fastify, R0.19 feature flags restent à faire dans Phase 0.)
