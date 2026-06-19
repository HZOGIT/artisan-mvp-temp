# Backlog itérations billing — agent solo

Mis à jour manuellement après chaque itération. Une itération = un commit.

## Processus

1. L'agent lit ce fichier, prend la première ligne `[ ]`
2. Implémente, gate (TS + tests + ESLint), montre le diff
3. Commit + push + ntfy
4. Coche la case + met à jour ce fichier

## Backlog

- [x] **iter A** — Supprimer `// ──` separators dans `billing-use-cases.test.ts` (bloque ESLint pre-commit sur futurs commits test)
- [x] **iter B** — L1 tests `cancelAtPeriodEnd` + `reactivateSubscription` (3-4 cas, no-op + event + NotFoundError)
- [x] **iter C** — Phase 10 E2E : ajouter cas `changePlan` / `cancelAtPeriodEnd` / `reactivate` dans `scripts/staging-e2e-mutations.mjs`
- [x] **iter D** — CLAUDE.md : section règle `//` interdit → utiliser `/** … */` ; exemples ; quand utiliser des separators (commit 73889434)

## Log

### iter D — 2026-06-19
- CLAUDE.md : section "Environnements — déploiement" (env dev = staging, CF Pages = GitHub integration, wrangler secret pour VITE_*)
- CLAUDE.md : section "Règle commentaires" (// interdit, /** … */ à la place, exemples)
- Commité dans 73889434

### iter C — 2026-06-19
- CAS 5 `billing.changePlan-persist` : change plan starter↔pro → plan_id refetch + restaure le plan initial
- CAS 6 `billing.cancelAtPeriodEnd+reactivate` : cancel_at positionné puis effacé → round-trip complet
- Skip gracieux si aucune subscription active sur le compte e2e
- Syntaxe JS valide ✅

### iter B — 2026-06-19
- `cancelAtPeriodEnd` : 4 cas (current_period_end, fallback now, no-op, NotFoundError)
- `reactivateSubscription` : 3 cas (cancel_at→null + event, no-op si déjà null, NotFoundError)
- 51/51 tests L1 ✅

### iter A — 2026-06-19
- Supprimé ~10 `// ──` separators dans `billing-use-cases.test.ts`
- Gate ESLint ✅ · 44/44 tests ✅
