# Audit — Webhook Stripe : cycle de vie abonnement (deleted / invoice paid / failed / trial_will_end) — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `handleSubscriptionDeleted`, `handleInvoicePaymentSucceeded`,
> `handleInvoicePaymentFailed`, `handleTrialWillEnd` (`webhookHandler.ts`).
> Complète l'audit `handleCheckoutSessionCompleted` (2026-06-08).

---

## Conclusion : transitions d'abonnement correctement câblées. Pas de BLOCKER/HIGH nouveau.

### Transitions correctes

| Événement Stripe | Handler | Effet | OK |
| -- | -- | -- | -- |
| `customer.subscription.deleted` | `handleSubscriptionDeleted` | `plan='expired'`, `status='canceled'` + email résiliation | ✓ (le guard bloque `canceled` + période passée) |
| `invoice.payment_succeeded` (sub) | `handleInvoicePaymentSucceeded` | `status='active'` + refresh `currentPeriodStart/End` | ✓ **récupère `past_due`→`active`** + convertit trial→active au 1ᵉʳ paiement |
| `invoice.payment_failed` (sub) | `handleInvoicePaymentFailed` | `status='past_due'` + email « action requise » | ✓ |
| `customer.subscription.trial_will_end` | `handleTrialWillEnd` | email J-3 essai | ✓ |

### Points sains

- **Séparation facture client vs abonnement** : `handleInvoicePaymentSucceeded`
  **`return` si `!invoice.subscription`** → ne touche **pas** la subscription SaaS
  lors d'un paiement de facture **client** (géré par `checkout.session.completed`).
  Pas de contamination croisée.
- **Recharge de l'objet Stripe** : `subscriptions.retrieve(...)` pour avoir
  `current_period_end` à jour (pas la valeur potentiellement périmée de
  l'événement).
- **Chemin de récupération `past_due`** existant : un abonnement en échec qui se
  régularise repasse `active` via `invoice.payment_succeeded` → le `past_due` n'est
  pas un état terminal.
- `resolveArtisanId(metadata, customerId)` (avec fallback sur le customerId) avant
  toute écriture.

---

## Gaps connexes (déjà tracés, hors correctness de ces handlers)

- **Garde paywall ne bloque pas `past_due`/`unpaid`** → **OPE-64** (le handler pose
  bien `past_due`, c'est le `subscriptionGuard` qui ne le traite pas).
- **Entitlements dérivés de `metadata.plan`** (pas du price ID) → **OPE-28**.
- **Pas d'idempotence webhook** (re-livraison → emails/notifs dupliqués ; ces
  handlers sont idempotents sur le statut mais pas sur les emails) → **OPE-29**.
- **Trial Stripe inconditionnel** (double essai / empilable) → **OPE-66**.
- Emails de ces handlers : silencieux si `RESEND_API_KEY` absent → **OPE-69**.

---

## Verdict

Cycle de vie abonnement **correctement câblé** : trial→active, past_due→active
(récupération), failed→past_due, deleted→canceled/expired, séparation
facture-client/abonnement nette. Les défauts restants sont **en aval** (guard,
entitlements, idempotence, trial) et **déjà filés**. **Pas d'issue Linear.**
