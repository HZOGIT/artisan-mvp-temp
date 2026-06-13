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

## Prochaine action : **R0.11 — `withTenant()` / `dbForTenant(ctx)` (OPE-197)**
Créer `src/shared/db/withTenant.ts` : ouvre une transaction Drizzle (pg), exécute `select set_config('app.tenant', <artisanId>, true)` puis le callback, et un helper `dbForTenant(ctx: TenantContext)` que les repositories utiliseront. Dépend du client pg (drizzle node-postgres). ⚠️ La démonstration RLS « deux tenants ne se voient pas » dépend aussi de R0.12 (policies RLS) — si RLS pas encore posé, tester au moins que `set_config` est bien appliqué dans la transaction (lecture `current_setting('app.tenant')`). Gate `tsc src` + test (PG jetable/dev). Pas de `OPE-XXX` en code. Puis 4 canaux → R0.12 (OPE-198, RLS).
