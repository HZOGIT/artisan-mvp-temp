# Boucle itérative — Billing UI maison

## Contexte

Tu implémentes les use cases billing maison côté frontend (React / tRPC / Stripe Elements).
Backend 100% complet : procédures `billing.*` dans `apps/api/modules/billing/`.

## À chaque itération

1. **Lis le journal** : `docs/billing/journal-billing-ui.md`
   - Identifie la "Prochaine cible"
   - Lis l'état courant des use cases (tableau)

2. **Implémente la prochaine cible** (une phase à la fois — pas plusieurs)
   - Code dans `apps/web/src/features/abonnement/` UNIQUEMENT
   - Exceptions autorisées : install npm + `scripts/staging-e2e-mutations.mjs` (Phase 6)
   - Jamais `git add -A` — toujours `git add <chemins explicites>`

3. **Gate TypeScript obligatoire** après chaque changement :
   ```bash
   tsc -p tsconfig.web.json --noEmit
   ```
   Si erreurs → corriger avant commit.

4. **Gate build** (Phase 2+) :
   ```bash
   pnpm --filter web build
   ```

5. **Commit chirurgical** :
   ```
   feat(billing-ui): <description courte>
   ```

6. **Mise à jour du journal** :
   - Marque la phase comme DONE dans le tableau use cases
   - Ajoute une entrée dans "Log d'itérations"
   - Met à jour "Prochaine cible"

7. **Commit journal** séparé si besoin, ou dans le même commit.

## Règles

- Un seul use case / une seule phase par itération
- Tsc gate AVANT commit — jamais de red TypeScript committé
- La couche application (`use-billing-maison.ts`) est la SEULE couche à importer tRPC
  Les composants UI importent uniquement le hook, jamais `trpc` directement
- Pour Stripe Elements (Phase 4) : `loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)`
  La clé publiable est déjà utilisée côté legacy (`VITE_STRIPE_PUBLISHABLE_KEY`)

## Structure cible

```
apps/web/src/features/abonnement/
  application/
    use-abonnement.ts        (existant — ne pas toucher)
    use-billing-maison.ts    (à créer Phase 1)
  ui/
    abonnement-section.tsx   (existant — modifier en Phase 5 seulement)
    billing-maison-section.tsx  (à créer Phase 2)
    add-card-dialog.tsx      (à créer Phase 4)
```

## Référence backend

- Procédures : `apps/api/modules/billing/interface/trpc/billing.router.ts`
- Types output : `RouterOutputs["billing"]["getBillingInfo"]`
- Tests backend : `docs/billing/journal-refonte-billing.md`
