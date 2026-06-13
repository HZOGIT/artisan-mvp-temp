# Journal — Refonte clean-archi (post-migration PG)

> Source de vérité du **cron itératif** de la refonte. À lire au début de CHAQUE itération
> pour récupérer la **Prochaine action**, puis l'exécuter, gater, tracer (4 canaux), et
> mettre à jour ce fichier. Survit à la compaction de contexte.

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

## Prochaine action : **R0.10 — `TenantContext` (shared kernel)**
Créer `src/shared/tenant/` : type `TenantContext` (au minimum `artisanId: number`, + `userId`, `role` si utile) + une fonction d'extraction depuis le JWT (réutiliser la logique de `server/_core/auth-simple` — lire le token, en tirer artisanId/userId/role) **sans dépendre du legacy** (port/adaptateur). Tests unit : extraction d'un JWT valide → TenantContext correct ; JWT absent/invalide → erreur/null. Gate `tsc -p tsconfig.src.json` vert + tests verts. Pas de `OPE-XXX` en commentaire. Puis 4 canaux + MAJ « Prochaine action » → R0.11 (withTenant). Créer/relier une issue Linear Phase 0 (0.10) si elle n'existe pas.
