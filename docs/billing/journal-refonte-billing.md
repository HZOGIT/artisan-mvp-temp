# Journal de refonte — Billing maison off-session

Référence : OPE-307 (décision), OPE-308 (Phase 1), OPE-309/310 (scheduler/dunning)

## Objectif

Abandon de Stripe Subscriptions → SetupIntent + PaymentIntent off-session (MIT).
Stripe reste processeur de paiement, Operioz gère les cycles, les factures, la numérotation légale.

## État courant

**Phase 1 — SetupIntent flow + tRPC router** : EN COURS

## TODO transversal

- [ ] Nettoyer les variables d'env Stripe relatives aux pricings (ex. `STRIPE_PRICE_ID_*`, `STRIPE_PRODUCT_*`) qui ne servent plus une fois billing_mode=maison actif.

---

**Phase 0 — Infrastructure Drizzle** : DONE

Ports créés :
- `apps/api/shared/ports/billing.ts` — BillingPort interface
- `apps/api/shared/ports/billing-adapter.ts` — BillingAdapter (Stripe SDK) + FakeBillingPort

Migrations créées (pas encore appliquées) :
- `drizzle/pg/0005_greedy_rockslide.sql` — 9 tables auto-générées par drizzle-kit
- `drizzle/pg/0006_billing-maison-extras.sql` — partial indexes + CHECK + self-ref FK

Schema Drizzle :
- `drizzle/schema.pg.ts` — 9 tables billing_* en v2 (commit 6fad058b)

## Backlog par itération

| Iter | État | Description |
|------|------|-------------|
| 1 | ✅ DONE (6fad058b) | 9 tables finales dans schema.pg.ts |
| 2 | ✅ DONE (f075749b) | migrations 0005 (auto) + 0006 (custom extras) + CLAUDE.md |
| 3 | ✅ DONE (5a894e14) | Domain types `apps/api/modules/billing/domain/` |
| 4 | ✅ DONE (f3612657) | BillingPort + BillingAdapter : retrievePaymentIntent() |
| 5 | ✅ DONE | Bilan Phase 0 posté sur OPE-308 |

## Log d'itérations

### Iter 1 — 2026-06-19
- Schéma v2 : 9 tables Drizzle (billing_payment_methods, billing_subscriptions,
  billing_cycles, billing_charge_attempts, billing_invoices, billing_invoice_lines,
  billing_invoice_sequences, billing_webhook_events, billing_events)
- bigint *_cents, FK ON DELETE RESTRICT, UNIQUE cycle/period, self-ref original_invoice_id
- pnpm check ✅ — commit `6fad058b`

### Iter 2 — 2026-06-19
- Migration auto `0005_greedy_rockslide.sql` (drizzle-kit generate)
- Migration custom `0006_billing-maison-extras.sql` (partial indexes, CHECK, self-ref FK)
- CLAUDE.md : règle "deux migrations" documentée

## Prochaine cible (Phase 1)

1. tRPC billing router (`apps/api/modules/billing/interface/trpc/billing.router.ts`)
2. SetupIntent flow + feature flag `billing_mode`
3. Front Stripe Elements

**Tests prioritaires à livrer (Vitest)** : tous les cas de changement de plan —
upgrade/downgrade starter↔pro↔enterprise, passage monthly↔yearly,
calcul prorata J restants, facturation différentiel dans `billing_invoices`.

## Phases futures

- **Phase 1 (OPE-308)** : SetupIntent flow, front Stripe Elements, tRPC billing router, feature flag `billing_mode`
- **Phase 2 (OPE-309/310)** : Scheduler + dunning + webhooks
- **Phase 3** : Migration depuis Stripe Subscriptions
- **Phase 4** : Cleanup StripePort (retirer createCheckoutSession, createBillingPortalSession, etc.)

## Tests — itérations cron

### Itération 1 — 2026-06-19
**Cible :** L2 Drizzle — cas manquants sur `billing-repository-drizzle.ts`
**Cas ajoutés (6 nouveaux tests) :**
- `createCycle + findPendingCycle` : cycle créé retrouvé en pending
- `findPendingCycle null` : retourne null quand le seul cycle est paid
- `updateSubscriptionStatus` : trialing → active (avec PM), B non touché
- `updateSubscriptionPaymentMethod` : lie PM au bon tenant
- `findInvoicesByArtisan` : scope + isolation cross-tenant
- `findInvoicesByArtisan limit` : respecte le paramètre limit
**Bugs corrigés en repo :**
- `listPaymentMethods` : `eq(revoked_at, null)` → `isNull(revoked_at)` (WHERE = NULL toujours faux)
- Cleanup tests : FK RESTRICT + chk_pm_required → UPDATE atomique status+PM avant DELETE
**Résultat :** 13/13 ✅ (L2 PG) — commit `pending`

## Décisions clés

- Numérotation : `OPE-YYYY-NNNNN` (factures), `AV-YYYY-NNNNN` (avoirs) — séquentielle globale, allouée à la finalisation uniquement
- TVA : base points par ligne (`tax_rate_bps`), agrégée sur la facture
- PDF : à la demande (pas d'object storage pour l'instant)
- Facturation unitaire : supportée via `type = 'one_time'` sur `billing_invoices`
- Anti double-prélèvement : `billing_charge_attempts.idempotency_key` (uuid v4 persisté AVANT l'appel Stripe)
- Zombie cycles : `charging_started_at` + réconciliateur (> 15 min en charging → retrieve PI)
- Webhook idempotence : `billing_webhook_events(stripe_event_id PK)` + INSERT ON CONFLICT DO NOTHING
