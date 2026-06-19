# Journal — Billing UI maison (frontend)

Référence backend : `docs/billing/journal-refonte-billing.md`
Backend 100% complet (84 tests) — `billing.*` tRPC prêt côté API.

## État courant

**0% — aucun use-case billing maison câblé côté UI.**
`AbonnementSection` appelle uniquement `trpc.subscription.*` (billing Stripe legacy).

## Use cases à implémenter

| Use case | Procédure tRPC | État |
|---|---|---|
| Voir abonnement + cartes | `billing.getBillingInfo` | ❌ |
| Ajouter une carte | `billing.createSetupIntent` + Stripe Elements + `billing.confirmPaymentMethod` | ❌ |
| Supprimer une carte | `billing.revokePaymentMethod` | ❌ |
| Changer carte par défaut | `billing.setDefaultPaymentMethod` | ❌ |
| Voir factures récentes | `billing.getBillingInfo` → `recentInvoices` | ❌ |

## Plan par phase (une phase = 1–2 itérations)

### Phase 1 — Fondations
- Installer `@stripe/react-stripe-js` + `@stripe/stripe-js`
- Créer `apps/web/src/features/abonnement/application/use-billing-maison.ts`
  (hook app layer : wraps `billing.*`, invalide le cache à chaque mutation)
- Gate : `tsc -p tsconfig.web.json --noEmit`

### Phase 2 — Affichage lecture seule
- Créer `apps/web/src/features/abonnement/ui/billing-maison-section.tsx`
  - Carte "Abonnement maison" : plan, statut, prochaine période
  - Carte "Moyens de paiement" : liste + badge default
  - Carte "Factures récentes" : N dernières factures
- Gate : `tsc` + `vite build`

### Phase 3 — Actions simples (sans Stripe)
- Dans `BillingMaisonSection` : boutons "Supprimer" + "Définir par défaut"
- Dialog de confirmation avant suppression
- Feedback toast (succès / erreur)
- Gate : `tsc` + `vite build`

### Phase 4 — Ajout de carte (Stripe Elements)
- `AddCardDialog` : wraps `@stripe/react-stripe-js` Elements + SetupIntent flow
  1. `createSetupIntent` → `clientSecret`
  2. `stripe.confirmSetup(clientSecret)` → `paymentMethodId` + `customerId`
  3. `confirmPaymentMethod({ stripePaymentMethodId, stripeCustomerId, setAsDefault })`
- Gate : `tsc` + `vite build`

### Phase 5 — Intégration dans la page
- Wire `BillingMaisonSection` dans `AbonnementSection` ou `parametres-page.tsx`
  (condition sur `billingInfo` présent / feature flag à définir)
- Test navigateur : `/v2/parametres` → section visible et fonctionnelle
- Gate : sweep Playwright + mutations

### Phase 6 — Anti-régression E2E
- Ajouter cas dans `scripts/staging-e2e-mutations.mjs` :
  - Affichage BillingInfo (paymentMethods non vide)
  - Revoke d'une carte test
  - Set default d'une carte test

## Prochaine cible

**Phase 2** — `billing-maison-section.tsx` : affichage lecture seule (abonnement + cartes + factures)

## Log d'itérations

### Itération 1 — 2026-06-19
**Phase 1 — Fondations**
- `@stripe/react-stripe-js@6.6.0` + `@stripe/stripe-js@9.8.0` installés
- `use-billing-maison.ts` créé : hook application layer wrappant les 5 procédures billing.*
  (getBillingInfo query + revokePaymentMethod / setDefaultPaymentMethod / createSetupIntent / confirmPaymentMethod mutations)
- Types exportés : `BillingInfo`, `BillingPaymentMethod`, `BillingSubscription`, `BillingInvoice`
- Gate `pnpm check` ✅
**Prochaine cible :** Phase 2 — composant lecture seule `billing-maison-section.tsx`
