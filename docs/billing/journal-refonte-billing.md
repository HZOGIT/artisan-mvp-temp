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

### Itération 11 — 2026-06-19
**Cible :** L1 — gaps confirmPaymentMethod sans sub + getBillingInfo plan_id inconnu + fix bug stale return
**Bug découvert :** `confirmPaymentMethod` retournait `pm` avec `is_default=false` stale même quand `setAsDefault=true` (savePaymentMethod insère avec is_default=false, puis setDefaultPaymentMethod met à jour le DB, mais l'objet `pm` n'était pas rafraîchi). Fix dans `billing-use-cases.ts` : `return { paymentMethod: params.setAsDefault ? { ...pm, is_default: true } : pm }`.
**Cas ajoutés (2) :**
- `confirmPaymentMethod setAsDefault=true` sans subscription → PM promu default, chemin `if(sub)=false` no-op sans crash (onboarding sans sub créée)
- `getBillingInfo` plan_id inconnu → `plan=undefined` (résilience aux données corrompues / plans dépréciés)
**Résultat :** 31/31 ✅ (L1 sans DB)
**Total billing :** 89 tests (87 → 89)

### Itération 10 — 2026-06-19
**Cible :** L2 Drizzle — gaps onConflictDoUpdate, append-only events, ordering DB réel
**Cas ajoutés (3) :**
- `saveSubscription` upsert : 2e appel même artisan_id change `plan_id` (`onConflictDoUpdate` branch jamais exercée avant)
- `listPaymentMethods` ordre DB réel : carte default en tête (is_default DESC) — L1 couvrait le fake, L2 prouve le vrai SQL
- `appendEvent` deux fois → deux IDs distincts : append-only vérifié à DB level (pas de déduplication silencieuse)
**Résultat :** 18/18 ✅ (L2 PG)
**Total billing :** 87 tests (84 → 87)

### Itération 9 — 2026-06-19
**Source :** recherche web (idempotency, race conditions, event sourcing in payment systems)
**Cible :** L1 — idempotence double-revoke, rotation de carte, ordre liste
**Cas ajoutés (3) :**
- `revokePaymentMethod` idempotent : révoquer 2× la même carte ne lève pas d'erreur — `findPaymentMethodById` ne filtre pas `revoked_at`, garantie pour idempotence webhooks
- `confirmPaymentMethod setAsDefault=true` rotation : remplace l'ancien PM sur la sub (pm1 → pm2, sub pointe vers pm2)
- `listPaymentMethods` ordre : carte default en premier (is_default DESC) — critique pour l'UI
**Résultat :** 29/29 ✅ (L1 sans DB)
**Total billing :** 84 tests (81 → 84)

### Itération 8 — 2026-06-19
**Source :** recherche web sur edge cases billing/Stripe (dunning, expiry, boundary conditions)
**Cible :** L1 use-cases + domaine — chemins non couverts identifiés par la recherche
**Cas ajoutés (5) :**
- `setDefaultPaymentMethod` avec sub → `payment_method_id` mis à jour (chemin `if(sub)` jamais testé)
- `setDefaultPaymentMethod` sans sub → guard `if(sub)` = no-op (subscription reste null)
- `setDefaultPaymentMethod` trace événement `payment_method.set_default` avec `last4` (jamais testé)
- `isDue` `nextRetryAt` exactement égal à `now` → true (borne `>=`, pas strictement `>`)
- `nextCycleAmount` `past_due` → montant du plan (scheduler doit retenter, pas 0)
**Résultat :** 58/58 ✅ (L1 26 tests + domaine 32 tests, sans DB)
**Total billing :** 81 tests (76 → 81)

### Itération 7 — 2026-06-19 — BOUCLE TERMINÉE
**Aucun nouveau test ajouté.** Tous les cas testables sans Phase 2 ni billingPort override sont couverts.
**Bilan final : 76 tests, 4 fichiers, tous verts.**
| Couche | Fichier | Tests |
|--------|---------|-------|
| Domaine | `billing-domain.test.ts` | 30 |
| L1 use-cases | `billing-use-cases.test.ts` | 23 |
| L2 Drizzle | `billing-repository-drizzle.test.ts` | 15 |
| L3 router | `billing.router.test.ts` | 8 |
**Cas restants (bloqués) :**
- `createSetupIntent 200` L3 — nécessite `billingPort` override dans `AppDeps` (`app.ts` hors scope cron) ou clé Stripe test. L1 couvre déjà la logique métier via `FakeBillingPort`.
- `confirmPaymentMethod 200` L3 — même blocage.
**Prochaine itération utile :** Phase 2 scheduler (chargeOffSession idempotency, dunning retry, zombie recovery) quand les fichiers seront créés.

### Itération 6 — 2026-06-19
**Cible :** L3 — validations Zod (schéma Zod vérifié avant d'atteindre le use-case)
**Motivation :** Pattern présent dans 8+ autres router tests du projet, absent du billing.
**Cas ajoutés (1 test, 5 assertions) :**
- `revokePaymentMethod paymentMethodId=0` → 400 (z.number().int().positive() : 0 exclu)
- `revokePaymentMethod paymentMethodId=-1` → 400
- `setDefaultPaymentMethod paymentMethodId=0` → 400
- `confirmPaymentMethod stripePaymentMethodId=""` → 400 (z.string().min(1))
- `confirmPaymentMethod stripeCustomerId=""` → 400
**Résultat :** 8/8 ✅ (L3 PG)
**État final :** Toutes les lacunes testables sans Phase 2 et sans billingPort override sont couvertes. La suite nécessite : (a) Phase 2 scheduler ou (b) billingPort dans AppDeps pour débloquer createSetupIntent/confirmPaymentMethod L3.

### Itération 5 — 2026-06-19
**Cible :** L2 — branche legacy de `findStripeCustomerId` (fallback `subscriptions` table)
**Motivation :** `createSetupIntent` utilise ce fallback pour ne pas créer de doublon Stripe customer lors de la migration billing Stripe → maison. Seule la branche PM maison était testée.
**Cas ajoutés (2) :**
- `findStripeCustomerId fallback legacy` : artisan sans PM maison mais avec `subscriptions.stripe_customer_id` → retourne le customer legacy
- `findStripeCustomerId PM maison prioritaire` : si PM maison ET subscription legacy coexistent, le PM maison gagne (priorité 1 documentée dans le repo)
**Résultat :** 15/15 ✅ (L2 PG)
**État des priorités :** P1 ✅ P2 ✅ P3 ✅ P4 (Phase 2 inexistante) P5 partiellement bloquée (createSetupIntent/confirmPaymentMethod → BillingAdapter, nécessite billingPort override dans AppDeps ou clé Stripe). Prochaine itération utile = Phase 2 scheduler.

### Itération 4 — 2026-06-19
**Cible :** L3 router — chemins positifs (procédures repo-only) + fix régression auth
**Bug découvert :** Le `beforeAll` billing L3 n'insérait pas dans la table `artisans`.
`DrizzleTenantResolver` résout `artisanId = artisans.id` (NOT `users.id`) → `tenant = null` → 401 sur tous les tests avec cookie. Fix : insérer dans `artisans` + capturer `ARTISAN_ID`.
**Cas ajoutés (3 nouveaux) :**
- `getBillingInfo` → 200 avec PM et subscription réels (2 PMs visibles, plan = starter)
- `revokePaymentMethod` sur PM valide → 200, PM disparaît de la liste
- `setDefaultPaymentMethod` sur PM valide → 200, PM promue default
**Cas bloqués (documentés) :**
- `createSetupIntent 200` : nécessite `billingPort` override dans `AppDeps` (app.ts hors scope) ou clé Stripe test réelle
- `confirmPaymentMethod 200` : même blocage (`billing.retrievePaymentMethod` → Stripe réel)
**Résultat :** 7/7 ✅ (L3 PG) — dont les 4 tests existants enfin verts

### Itération 3 — 2026-06-19
**Cible :** Domaine edge cases — `billing-domain.test.ts` (25 → 30 tests)
**Cas ajoutés (5) :**
- `isZombie` boundary exact : false à T+15min pile (seuil `>` strict, pas `>=`)
- `isZombie` boundary +1ms : true à T+15min+1ms (juste après le seuil)
- `isDue status=skipped` : false (cycle délibérément sauté, ne pas retenter)
- `isDue status=processing` : false (traitement async en cours)
- `nextRetryAt attempt 4/5/10` : toujours J+7 non-null (Math.min bloque dépassement d'index — dead-code guard documenté)
**Résultat :** 30/30 ✅ (sans DB) — commit pending

### Itération 2 — 2026-06-19
**Cible :** L1 use-cases manquants (4 scénarios, 6 nouveaux tests)
**Cas ajoutés :**
- `confirmPaymentMethod setAsDefault=false` : PM persisté, sub.payment_method_id non modifié, aucune carte promue default
- `revokePaymentMethod carte default` (×2) : findDefaultPaymentMethod→null après révocation ; 2ème carte non promue automatiquement
- `createSetupIntent customer legacy/maison` : createCustomer Stripe jamais appelé si customer déjà dans repo
- `getBillingInfo recentInvoices` (×2) : factures retournées + isolation cross-tenant ; limite 12 respectée
**Résultat :** 23/23 ✅ (L1 sans DB) — commit pending

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
