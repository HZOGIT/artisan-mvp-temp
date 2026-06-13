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

## Prochaine action : **R0.12 — Migration RLS (OPE-198, Urgent)**
Créer une migration SQL Drizzle (`drizzle/pg/`) : pour **chaque table portant `artisan_id`** (et `artisanId` camelCase selon les tables), `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation USING (<col_artisan> = nullif(current_setting('app.tenant', true), '')::int)`. ⚠️ Lister d'abord les tables tenant (colonne artisan_id/artisanId) ; attention aux **deux conventions de nommage** de colonne (snake `artisan_id` pour les tables fix-duplicates, camel `artisanId` pour le legacy Drizzle). Prévoir un **rôle applicatif non-superuser** (sinon RLS bypassé — le superuser ignore RLS ; à cadrer : soit créer un rôle `app` + `FORCE ROW LEVEL SECURITY`, soit `ALTER TABLE … FORCE ROW LEVEL SECURITY` pour que même le propriétaire soit soumis). Test PG (`src/shared/db/` ou migration test) : sans `set_config` → 0 ligne sur une table RLS ; via `withTenant(ctx)` → seulement les lignes du tenant. Gate `tsc src` + test. Pas de `OPE-XXX` en code. Puis 4 canaux → R0.13 (ports effets de bord) ou poursuite Phase 0.
