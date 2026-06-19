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

### Itération 22 — 2026-06-19
**Cible :** L2 — `trial_ends_at` jamais vérifié en round-trip depuis la DB
**Cas ajoutés (1) :**
- L2 : `saveSubscription` → `trial_ends_at` non-null persiste via Drizzle et est retrouvable par `findSubscription` — le test existant (iter 9) créait une sub avec `trialEndsAt: new Date("2026-06-15")` mais n'assertait que `sub.artisan_id` et `findSubscription(...).id` ; `trial_ends_at` n'était jamais relu depuis la DB. Le scheduler Phase 2 lit ce champ pour décider si l'essai est expiré (comparaison date). Un bug de coercition Drizzle (Date → string UTC drift) ferait rater cette comparaison. Comparaison via `.toISOString().slice(0, 10)` pour éviter les variantes de timezone.
**Résultat :** L2 26/26 ✅
**Total billing :** 109 tests (108 → 109)

### Itération 21 — 2026-06-19
**Cible :** L2 — contrainte `chk_pm_required` non testée
**Cas ajoutés (1) :**
- L2 : `updateSubscriptionStatus` → 'active' sans PM viole `chk_pm_required` (DB CHECK) — le test existant (iter 11) couvrait le chemin positif (trialing → active avec PM) ; ce test couvre le cas d'inversion : le scheduler Phase 2 qui ferait `updateSubscriptionStatus` AVANT `updateSubscriptionPaymentMethod` serait attrapé par la contrainte DB. Reset admin `status='trialing', pm=null` en début de test pour garantir l'état, puis `saveSubscription` upsert pour confirmer la sub existe sans PM.
**Résultat :** L2 25/25 ✅
**Total billing :** 108 tests (107 → 108)

### Itération 20 — 2026-06-19
**Cible :** L1 — payload `payment_method.confirmed` non asserté
**Cas ajoutés (1) :**
- L1 : `confirmPaymentMethod` event payload `{ brand, last4, isDefault }` + `entity_id` — l'event existait (iter 14) mais seule la présence `some(e => event_type==='confirmed')` était vérifiée ; même lacune corrigée pour `revokePaymentMethod` en iter 19 ; complète la couverture audit trail des 3 mutations non-scheduleur
**Résultat :** L1 37/37 ✅
**Total billing :** 107 tests (106 → 107)

### Itération 19 — 2026-06-19
**Cible :** L1 (1 test) + L3 (1 test) — payloads d'événements non assertés
**Cas ajoutés (2) :**
- L1 : `revokePaymentMethod` event payload contient `last4` + `brand` + `entity_id` — `some(e => event_type==='revoked')` ne vérifiait pas le contenu ; symétrique avec `setDefaultPaymentMethod` qui assertait déjà `payload.last4`
- L3 : `setDefaultPaymentMethod` → event `payment_method.set_default` persisté en DB — symétrique avec le test revoke ajouté en iter 18 ; vérifie la chaîne HTTP → appendEvent → billing_events pour les deux mutations non-Stripe
**Résultat :** L1 36/36 ✅ · L3 11/11 ✅
**Total billing :** 106 tests (104 → 106)

### Itération 18 — 2026-06-19
**Cible :** L2 (1 test) + L3 (1 test) — shape de createCycle et audit trail event
**Cas ajoutés (2) :**
- L2 : `createCycle` shape complète — `amount_cents`, `currency`, `period_start`, `period_end` vérifiés à DB réel ; seuls `id`, `status`, `subscription_id` étaient assertés ; le scheduler Phase 2 lit ces 4 champs pour charger le bon montant sur la bonne période (piège coercition Drizzle dates). Note : cycle marqué 'paid' en fin de test car `saveSubscription` utilise `onConflictDoUpdate` → sub.id réutilisé par tous les tests sur artisan B.
- L3 : `revokePaymentMethod` → event `payment_method.revoked` persisté en DB (audit trail complet) — les tests précédents vérifiaient 200 + PM disparaît de getBillingInfo, mais pas que `appendEvent` a écrit en DB ; teste la chaîne HTTP → use-case → repo → `billing_events`
**Résultat :** L2 24/24 ✅ · L3 10/10 ✅
**Total billing :** 104 tests (102 → 104)

### Itération 17 — 2026-06-19
**Cible :** L2 (1 test) + L3 (1 test) — ordering et shape HTTP non assertés
**Cas ajoutés (2) :**
- L2 : `findInvoicesByArtisan` ORDER BY `created_at` DESC explicitement vérifié — le test existant se nommait "triées par date desc" mais n'assertait que `artisan_id` et `length` ; insert avec `created_at = NOW()-2 days` pour garantir une facture positionnée en dernier (note : `status='draft'` requis — contrainte `chk_number_finalized`)
- L3 : `getBillingInfo` shape complète → `recentInvoices` présent dans la réponse HTTP — ni `recentInvoices` ni `plan` n'étaient vérifiés au niveau HTTP ; test détecterait une régression de sérialisation superjson
**Résultat :** L2 23/23 ✅ · L3 9/9 ✅
**Total billing :** 102 tests (100 → 102)

### Itération 16 — 2026-06-19
**Cible :** L1 (2 tests) + Domaine (1 test) — shape incomplète des résultats
**Cas ajoutés (3) :**
- L1 : `createSetupIntent` retourne `setupIntentId` non vide — requis par Stripe Elements pour `stripe.confirmSetup()` ; le champ existait dans le type mais n'était jamais vérifié (seulement `clientSecret`)
- L1 : payload événement `setup_intent.created` contient `setupIntentId` + `stripeCustomerId` — recovery zombie Phase 2 : le scheduler retrouvera le setupIntentId dans les événements pour réconcilier un flow interrompu
- Domaine : `planLimits` retourne `maxDevicesPerUser` et `maxConcurrentSessions` (shape complète) — seul `maxUsers` était vérifié ; les 2 autres champs sont utilisés par le middleware d'auth sessions/appareils
**Résultat :** L1 35/35 ✅ · Domaine 35/35 ✅
**Total billing :** 100 tests (97 → 100)

### Itération 15 — 2026-06-19
**Cible :** Domaine (2 cas) + L2 (1 cas)
**Cas ajoutés (3) :**
- Domaine : `isCancelable(trialing)` → true — annuler un essai est autorisé (seuls active/past_due étaient testés, trialing oublié)
- Domaine : `nextCycleAmount(canceled)` → plan amount — pas de cas spécial pour canceled ; le scheduler ne doit jamais appeler cette fonction pour une sub canceled (documenté pour la Phase 2)
- L2 : `findPendingCycle` avec 2 cycles pending → retourne le plus récent (orderBy period_start DESC limit 1) — cas de backfill ou bug scheduler avec cycles dupliqués
**Résultat :** Domaine 34/34 ✅ · L2 22/22 ✅
**Total billing :** 97 tests (94 → 97)

### Itération 14 — 2026-06-19
**Cible :** L1 — comportement de revokePaymentMethod vis-à-vis de la subscription
**Cas ajoutés (2) :**
- `revokePaymentMethod` lié à une sub → `sub.payment_method_id` inchangé : documente que le use-case ne touche pas `billing_subscriptions`. La sub reste liée au PM révoqué — le scheduler Phase 2 doit vérifier si le PM est actif avant de prélever.
- `getBillingInfo` après révocation → PM révoquée absente de `paymentMethods` : prouve que `listPaymentMethods` filtre `revoked_at IS NULL`, vue depuis le point d'entrée `getBillingInfo` (pas seulement depuis `revokePaymentMethod`)
**Résultat :** 33/33 ✅ (L1 sans DB)
**Total billing :** 94 tests (92 → 94)

### Itération 13 — 2026-06-19
**Cible :** L2 — contrats de bas niveau non prouvés à DB réel
**Cas ajoutés (2) :**
- `findPaymentMethodById` sur PM révoquée → retourne la carte (revoked_at non filtré à DB level) — documente et protège le contrat qui rend le double-revoke idempotent ; contraste explicite avec `listPaymentMethods` qui filtre `revoked_at IS NULL`
- `saveStripeCustomerId` no-op réellement prouvé : appeler la méthode n'écrase pas le résultat de `findStripeCustomerId` (décision architecturale — customer ID porté par billing_payment_methods, pas de table centrale)
**Résultat :** 21/21 ✅ (L2 PG)
**Total billing :** 92 tests (90 → 92)

### Itération 12 — 2026-06-19
**Cible :** L2 + L3 — findDefaultPaymentMethod après revoke + Zod setAsDefault non-boolean
**Cas ajoutés (1 test L2 + 2 assertions L3) :**
- L2 : `revokePaymentMethod sur carte default → findDefaultPaymentMethod retourne null` — documente que `revokePaymentMethod` pose `is_default=false`, garantissant que `findDefaultPaymentMethod` retourne null même si la query Drizzle ne filtre pas `revoked_at IS NULL` (inconsistance fake vs Drizzle documentée en commentaire)
- L3 : `setAsDefault: "oui"` → 400 (Zod `.boolean()` rejette les strings)
- L3 : `setAsDefault: 1` → 400 (Zod `.boolean()` rejette les numbers)
**Résultat :** L2 19/19 ✅ · L3 8/8 ✅
**Total billing :** 90 tests (89 → 90)

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
