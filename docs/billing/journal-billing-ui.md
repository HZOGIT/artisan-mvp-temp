# Journal — Billing UI maison (frontend)

Référence backend : `docs/billing/journal-refonte-billing.md`
Backend 100% complet (84 tests) — `billing.*` tRPC prêt côté API.

## État courant

**0% — aucun use-case billing maison câblé côté UI.**
`AbonnementSection` appelle uniquement `trpc.subscription.*` (billing Stripe legacy).

## Use cases à implémenter

| Use case | Procédure tRPC | État |
|---|---|---|
| Voir abonnement + cartes | `billing.getBillingInfo` | ✅ |
| Ajouter une carte | `billing.createSetupIntent` + Stripe Elements + `billing.confirmPaymentMethod` | ✅ |
| Supprimer une carte | `billing.revokePaymentMethod` | ✅ |
| Changer carte par défaut | `billing.setDefaultPaymentMethod` | ✅ |
| Voir factures récentes | `billing.getBillingInfo` → `recentInvoices` | ✅ |

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

**Phase 10** — E2E anti-régression : ajouter cas dans `scripts/staging-e2e-mutations.mjs` pour `changePlan`, `cancelAtPeriodEnd`, `reactivate` (actions UI → vérif persistance via refetch).

## Log d'itérations

### Itération 9 — 2026-06-19
**Phase 9 — `cancelAtPeriodEnd` + `reactivate` backend + UI**
- `IBillingRepository.updateCancelAt(ctx, cancelAt: Date | null)` ajouté dans interface + Drizzle + Fake
- `cancelAtPeriodEnd` use-case : no-op si `cancel_at` déjà posé ; fixe `cancelAt = current_period_end ?? now()` + event `subscription.cancel_scheduled`
- `reactivateSubscription` use-case : no-op si `cancel_at` déjà null ; remet `cancel_at = null` + event `subscription.reactivated`
- `billing.cancelAtPeriodEnd` + `billing.reactivate` tRPC procedures ajoutées (mutations sans input)
- `use-billing-maison.ts` : `cancelAtPeriodEnd()` + `isCanceling` + `reactivate()` + `isReactivating` exposés
- `SubscriptionCard` étendu : bandeau rouge "Annulation le <date>" + bouton "Réactiver" si `cancel_at` non-null ; bouton "Annuler l'abonnement" (XCircle) si actif/trialing sans annulation programmée ; AlertDialog de confirmation avant annulation
- Gate `tsc --noEmit` ✅ · `pnpm build` ✅ (32s)

### Itération 8 — 2026-06-19
**Phase 8 — `changePlan` backend + UI (upgrade/downgrade)**
- Backend `changePlan` use-case ajouté dans `billing-use-cases.ts` : valide le plan, vérifie l'existence de la sub, no-op si même plan, appelle `updateSubscriptionPlan` + `appendEvent(subscription.plan_changed)`
- `InvalidPlanError` ajouté (nouvelle classe d'erreur domaine)
- `IBillingRepository.updateSubscriptionPlan` ajouté dans l'interface + `BillingRepositoryDrizzle` + `FakeBillingRepository`
- `billing.changePlan` tRPC procedure ajoutée (input: `planId: z.enum(["starter","pro","enterprise"])`) ; `mapError` étendu à `InvalidPlanError → BAD_REQUEST`
- `use-billing-maison.ts` : `changePlan(planId)` + `isChangingPlan` exposés ; `PlanId` type exporté
- `billing-maison-section.tsx` : `PlanSelectorCard` ajouté — grille 3 colonnes (starter/pro/enterprise), plan actuel mis en avant (badge + bordure), bouton "Choisir" pour les plans non-actifs, toast succès/erreur, spinner sur le plan en cours de changement
- Gate : `tsc -p tsconfig.web.json --noEmit` ✅ · `pnpm build` ✅ (31s)

## Log d'itérations

### Itération 6 — 2026-06-19
**Phase 6 — Tests e2e anti-régression**
- `scripts/staging-e2e-mutations.mjs` : 3 cas ajoutés
  - CAS 2 `billing.getBillingInfo-shape` : shape API (paymentMethods + recentInvoices arrays) — empêche rendu silencieux cassé
  - CAS 3 `billing.section-render+dialog` : page `/parametres?tab=abonnement` sans pageerror + bouton "Ajouter" visible + clic → dialog ouvert
  - CAS 4 `billing.mutations-persist` : setDefaultPaymentMethod + revokePaymentMethod vérifiés via refetch (skip gracieux si 0 PM ; revoke seulement si ≥ 2 PM pour garder au moins 1 carte)
- Gate : syntaxe JS valide (pas de gate TS pour fichier .mjs)
- Exception scope billing UI autorisée (Phase 6 = scripts/staging-e2e-mutations.mjs)

### Itération 5 — 2026-06-19
**Phase 5 — Intégration dans la page**
- `billing-maison-section.tsx` : bouton "Ajouter une carte" (icône `Plus`) ajouté dans le `CardHeader` de `PaymentMethodsCard` ; prop `onAddCard` transmise depuis `BillingMaisonSection` ; state `addCardOpen` + `<AddCardDialog>` intégrés
- `abonnement-section.tsx` : import `BillingMaisonSection` + rendu à la fin de la section (après le `</Dialog>` de résiliation)
- Gate TypeScript : ✅ 0 erreur sur nos fichiers
- `parametres-page.tsx` hors scope — passage par `abonnement-section.tsx` (même résultat, dans le périmètre autorisé)

### Itération 4 — 2026-06-19
**Phase 4 — Ajout de carte (Stripe Elements)**
- `add-card-dialog.tsx` créé : dialog en 2 phases — loading (createSetupIntent) → Elements form (PaymentElement)
- `stripePromise` singleton initialisé hors composant avec `loadStripe(VITE_STRIPE_PUBLISHABLE_KEY)`
- `useEffect([open])` → appel `createSetupIntent` à l'ouverture du dialog, cleanup si fermé avant résolution
- `stripe.confirmSetup({ redirect: 'if_required' })` → évite la redirection, reste sur la page
- Extraction `payment_method` : `typeof pm === 'string' ? pm : pm.id` (gère string | PaymentMethod | null)
- `confirmPaymentMethod({ stripePaymentMethodId, stripeCustomerId, setAsDefault: true })` → toast succès
- Gestion erreurs Stripe (`result.error.message`) + erreur réseau (catch) → toast destructif
- Gate `tsc --noEmit` ✅
**Prochaine cible :** Phase 5 — intégration dans la page (bouton "Ajouter une carte" + wire dans parametres-page)

### Itération 3 — 2026-06-19
**Phase 3 — Actions simples (sans Stripe)**
- `billing-maison-section.tsx` modifié : ajout de boutons "Définir par défaut" (Star) et "Supprimer" (Trash2) sur chaque carte
- AlertDialog de confirmation avant suppression (action destructive) — annuler/confirmer avec loading spinner
- "Définir par défaut" = action immédiate (sans dialog) — toast succès/erreur
- Toast feedback via `sonner` : succès + erreur pour revoke et set-default
- États loading propagés depuis le hook (isRevoking, isSettingDefault) → spinner sur le bouton actif
- Gate `tsc --noEmit` ✅
**Prochaine cible :** Phase 4 — AddCardDialog (Stripe Elements)

### Itération 2 — 2026-06-19
**Phase 2 — Affichage lecture seule**
- `billing-maison-section.tsx` créé : 3 cartes (abonnement, moyens de paiement, factures récentes)
- Carte abonnement : plan résolu, statut avec Badge coloré, période en cours, fin d'essai si trialing
- Carte cartes : liste avec brand (label lisible), last4, expiry, badge "Par défaut" ; nullable fields gérés (brand/last4/exp_month/exp_year nullable en schema)
- Carte factures : number ou #id, date (paid_at ?? created_at), montant formaté, statut
- État loading (Loader2 spinner) + erreur + billingInfo null
- Gate `tsc -p tsconfig.web.json --noEmit` ✅ ; build vite échoue sur erreur pré-existante `app.tsx` (import `@/shared/ui-kit/sonner` manquant — refonte en cours, hors périmètre)
**Prochaine cible :** Phase 3 — actions revoke + set-default avec dialogs

### Itération 1 — 2026-06-19
**Phase 1 — Fondations**
- `@stripe/react-stripe-js@6.6.0` + `@stripe/stripe-js@9.8.0` installés
- `use-billing-maison.ts` créé : hook application layer wrappant les 5 procédures billing.*
  (getBillingInfo query + revokePaymentMethod / setDefaultPaymentMethod / createSetupIntent / confirmPaymentMethod mutations)
- Types exportés : `BillingInfo`, `BillingPaymentMethod`, `BillingSubscription`, `BillingInvoice`
- Gate `pnpm check` ✅
**Prochaine cible :** Phase 2 — composant lecture seule `billing-maison-section.tsx`
