# Billing maison off-session — Plan de migration

Linear projet : https://linear.app/operioz/project/billing-flexible-reprise-de-controle-de-la-business-logic-de-53645bf500c7

## Décision actée

**Nous passons au billing maison en mode off-session.** Stripe Subscriptions est abandonné.
Le prélèvement est piloté par nous via `SetupIntent` + `PaymentIntent off_session`.

OPE-307 ([Décision]) doit être passée en **Done** immédiatement avec ce contexte.

## Contexte technique existant

### Module subscription actuel

```
apps/api/modules/subscription/
  application/
    use-cases.ts                  # createSubscription, cancelSubscription, …
    subscription-reader.ts        # lire l'état d'abonnement d'un artisan
    subscription-webhook-writer.ts # traite les webhooks Stripe Subscriptions
    webhook-use-cases.ts          # dispatcher webhook
    webhook-payment-writer.ts     # traite checkout.session.completed (factures client)
    subscription-event-notifier.ts
  domain/
    subscription.ts               # entité Subscription
    webhook.ts                    # types webhook
  infra/
    *-drizzle.ts                  # repos PG
    *-fake.ts                     # fakes pour tests
  interface/trpc/
    subscription.router.ts        # routes tRPC exposées
```

### Port Stripe actuel (`apps/api/shared/ports/stripe.ts`)

Méthodes utilisées pour les abonnements (à conserver ou adapter) :
- `createCustomer` → à conserver (on continue d'avoir un Customer Stripe)
- `createCheckoutSession` → **à remplacer** par SetupIntent
- `createBillingPortalSession` → **à supprimer** (on gère nous-mêmes)
- `setCancelAtPeriodEnd` → **à remplacer** par logique maison
- `retrieveSubscription` → **à supprimer** (plus de Stripe Subscription)
- `constructEvent` → à conserver (webhooks Stripe restants)
- `createInvoiceCheckout` → à conserver (paiement factures clients ≠ abonnement SaaS)

### Schéma DB actuel (`drizzle/pg/`)

Table `subscriptions` :
- `artisan_id` (FK artisans)
- `stripe_customer_id` varchar
- `stripe_subscription_id` varchar ← **à remplacer**
- (autres colonnes à lire)

### Webhooks actuels (stripe-webhook-route.ts)

À lire pour comprendre quels événements sont traités aujourd'hui :
- `customer.subscription.*` → à supprimer
- `invoice.*` → à supprimer (billing Stripe)
- `checkout.session.completed` → à conserver pour le paiement des factures clients
- `payment_intent.succeeded/failed` → à ajouter (nouveaux événements off-session)

## Mission de cette session

### Étape 1 — Lire l'existant (OBLIGATOIRE avant tout plan)

```bash
# Module subscription complet
cat apps/api/modules/subscription/application/use-cases.ts
cat apps/api/modules/subscription/application/subscription-webhook-writer.ts
cat apps/api/modules/subscription/application/webhook-use-cases.ts
cat apps/api/modules/subscription/domain/subscription.ts
cat apps/api/modules/subscription/interface/trpc/subscription.router.ts
cat apps/api/shared/ports/stripe.ts
cat apps/api/shared/ports/stripe-adapter.ts
cat apps/api/interface/http/stripe-webhook-route.ts

# Schéma DB abonnements
grep -A 30 '"subscriptions"' drizzle/pg/0001_worthless_nomad.sql

# Référence dans app.ts
grep -n "subscription\|stripe" apps/api/app.ts | head -30
```

### Étape 2 — Produire le plan de migration détaillé

Rédiger un plan de migration structuré, **posté en commentaire Linear sur OPE-307**,
puis passer OPE-307 en **Done**.

Le plan doit couvrir :

#### A. Architecture cible

Décrire les composants du billing maison :
- `BillingPort` (nouveau port, remplace les méthodes d'abonnement de `StripePort`)
  - `createSetupIntent(customerId)` → URL Stripe Elements pour collecte carte
  - `confirmSetupIntent(setupIntentId)` → récupère le `paymentMethodId`
  - `chargeOffSession(customerId, paymentMethodId, amountCents, currency, metadata)`
    → crée un PaymentIntent off-session
  - `handleRequiresAction(paymentIntentId)` → URL 3DS pour SCA
- Module `apps/api/modules/billing/` (clean archi) :
  - `domain/` : `Plan`, `BillingCycle`, `SubscriptionMaison`, `BillingEvent`
  - `application/` : `startSubscription`, `renewCycle`, `cancelSubscription`,
    `chargeSubscription`, `handlePaymentFailed`, `handlePaymentSucceeded`
  - `infra/` : schéma Drizzle + adapters
  - `scheduler/` : job qui tourne toutes les heures, identifie les cycles échus,
    déclenche les prélèvements off-session
- Nouveaux webhooks Stripe à gérer :
  - `payment_intent.succeeded` → marquer cycle payé
  - `payment_intent.payment_failed` → déclencher dunning
  - `setup_intent.succeeded` → enregistrer le PaymentMethod

#### B. Schéma DB cible

Proposer le schéma Drizzle des nouvelles tables :
- `billing_payment_methods` : `artisanId`, `stripeCustomerId`, `stripePaymentMethodId`,
  `brand`, `last4`, `expMonth`, `expYear`, `isDefault`, `consentedAt`
- `billing_subscriptions` : `artisanId`, `planId`, `status` (active/past_due/canceled),
  `currentPeriodStart`, `currentPeriodEnd`, `cancelAt`, `canceledAt`
- `billing_cycles` : `subscriptionId`, `periodStart`, `periodEnd`, `amountCents`,
  `status` (pending/charging/paid/failed), `stripePaymentIntentId`, `attemptCount`,
  `nextRetryAt`, `paidAt`
- Modifier `subscriptions` existante → migration expand/contract
  (ajouter colonnes maison d'abord, remplir, supprimer stripe_subscription_id en dernier)

#### C. Séquence de migration (sans interruption)

Phase par phase, avec critère de "done" pour chaque :

**Phase 0 — Préparation (sans toucher à l'existant)**
- Créer `BillingPort` + `BillingAdapter` (wraps Stripe SetupIntent + PaymentIntent)
- Créer le module `billing/` avec son domaine + schéma DB
- Tester end-to-end en sandbox Stripe (OPE-303)

**Phase 1 — Collecte du moyen de paiement (OPE-308)**
- Remplacer Checkout `mode: subscription` par SetupIntent dans le flux d'inscription
- À la fin du SetupIntent : créer l'abonnement maison + stocker le PaymentMethod
- Garder les abonnements Stripe existants intacts
- Feature flag par artisan (`billing_mode: 'stripe' | 'maison'`)

**Phase 2 — Moteur de cycles + scheduler (OPE-309)**
- Créer le scheduler (cron 1h) qui détecte les cycles échus et prélève off-session
- Implémenter dunning J+1, J+3, J+5 puis suspension (OPE-310)
- Gérer les webhooks `payment_intent.*` (remplace `invoice.*`)

**Phase 3 — Migration des abonnés Stripe existants (OPE-312)**
- Pour chaque artisan avec `stripe_subscription_id` :
  - Récupérer son `PaymentMethod` depuis Stripe (sans re-collecter la carte)
  - Annuler l'abonnement Stripe à la fin de la période (`cancel_at_period_end`)
  - Créer l'abonnement maison avec le même PaymentMethod
- Migrer par cohorte (5%, 20%, 100%)

**Phase 4 — Cleanup (OPE-307 done)**
- Supprimer les webhooks `customer.subscription.*` et `invoice.*`
- Supprimer `createCheckoutSession`, `createBillingPortalSession`, `setCancelAtPeriodEnd`,
  `retrieveSubscription` du `StripePort`
- Supprimer `stripe_subscription_id` de la table `subscriptions`
- Remplacer le Billing Portal Stripe par une UI maison (OPE-311)

#### D. Risques et mitigation

- **SCA / 3DS** : les PaymentIntent off-session peuvent retourner `requires_action`
  → prévoir le flux de re-auth (email → lien Stripe hosted page)
- **Double prélèvement** pendant la migration : le cycle Stripe se termine,
  le cycle maison commence — s'assurer que les dates d'ancrage sont alignées
- **Rollback** : le feature flag `billing_mode` permet de re-basculer vers Stripe
  sans migration DB en urgence
- **PCI** : SetupIntent + Elements → on ne touche jamais les données carte
  (scope PCI minimal SAQ A)

#### E. Estimation effort

Estimer en jours-agent pour chaque phase.

### Étape 3 — Mettre à jour les issues Linear

- OPE-307 → **Done** (décision actée : billing maison off-session)
- OPE-300, OPE-301, OPE-302 → marquer **Done** (contexte suffisant pour passer à l'implem)
- Réordonner les issues d'implem (OPE-308 → OPE-312) selon la séquence de migration
- Créer les issues manquantes identifiées dans le plan

### Étape 4 — Démarrer la Phase 0

Après avoir posté le plan, commencer immédiatement la Phase 0 :
1. Créer `apps/api/shared/ports/billing.ts` — `BillingPort` interface
2. Créer `apps/api/shared/ports/billing-adapter.ts` — adapter Stripe (SetupIntent + PaymentIntent)
3. Écrire les types Drizzle des nouvelles tables dans un fichier schema séparé

Commit chirurgical : `git add <fichiers>`, jamais `git add -A`.

## Règles

- Lire le code AVANT d'écrire quoi que ce soit
- Commits chirurgicaux sur `staging`
- Ne pas casser le billing Stripe existant pendant la Phase 0
- Clés Stripe = `STRIPE_SECRET_KEY` (env existant, ne pas committer)
