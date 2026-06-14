# Audit — Intégrité du webhook Stripe

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

> Périmètre : `server/stripe/webhookHandler.ts` + `stripeService.ts`. Robustesse
> du traitement des événements (entitlements, idempotence, vérif signature).
> **Stripe Connect multi-tenant (OPE-6) hors périmètre.**

---

## Ce qui fonctionne correctement

- **Signature vérifiée** : `constructWebhookEvent` (signing secret) avant tout
  traitement ; signature absente → 400 ; secret vide → `constructEvent` throw → 400.
- **Ordre middleware correct** : la route webhook est montée avec
  `express.raw()` AVANT le `express.json()` global (raw body requis). ✓
- **Clés metadata cohérentes** entre `createCheckoutSession` (`facture_id`,
  `token_paiement`) et le handler `checkout.session.completed` → les paiements de
  factures clients sont bien marqués `payee`. ✓
- Mapping des statuts Stripe → internes (`trialing`/`past_due`/`canceled`/`active`)
  correct ; `subscription.deleted` bascule en `expired`. ✓

---

## 🟠 HIGH 1 — Entitlements dérivés de `metadata.plan` seulement (price ID ignoré) : un changement de plan via le portail Stripe désynchronise les droits

### Problème

`handleSubscriptionUpsert` (`server/stripe/webhookHandler.ts:208`) calcule le plan
et les limites **uniquement** depuis le metadata de la subscription :

```typescript
// webhookHandler.ts:216-219
const planInfo = planFromMetadata(sub.metadata) || { plan: 'trial', extraUsers: 0 };
const limits = PLAN_LIMITS[planInfo.plan] || PLAN_LIMITS.trial;
const maxUsers = limits.maxUsers + (planInfo.extraUsers || 0);
```

Le prix réellement souscrit est pourtant disponible et même stocké, mais **jamais
utilisé pour déterminer le plan** :

```typescript
// webhookHandler.ts:235 — stocké mais ignoré pour les droits
stripePriceId: sub.items?.data?.[0]?.price?.id,
```

Aucun mapping inverse `priceId → plan` n'existe (`grep priceToPlan|planFromPrice`
→ 0 résultat).

### Pourquoi c'est cassé

Le portail de facturation Stripe est exposé (`createPortal`,
`routers.ts:8262` → `billingPortal.sessions.create`). Quand un client **change de
plan via le portail** (upgrade/downgrade), Stripe émet `customer.subscription.updated`
mais **ne met PAS à jour le `metadata`** de la subscription (le metadata persiste
la valeur posée au checkout initial). Résultat :

- `sub.items.data[0].price.id` = **nouveau** prix (ex. entreprise)
- `sub.metadata.plan` = **ancien** plan (ex. pro)
- Le webhook ré-applique l'**ancien** plan → `plan='pro'`, `maxUsers=3` alors que
  le client paie l'entreprise (10 users). Incohérence : `stripePriceId` (entreprise)
  ≠ `plan` (pro) en base.

Cas dégénéré : tout `subscription.*` **sans** `metadata.plan` (sub créée hors du
flux checkout standard, ou metadata perdu) tombe sur le défaut **`trial`** →
un client payant se retrouve avec les limites d'essai (`maxUsers:1`).

### Impact

- Droits d'accès faux après tout changement de plan via le portail → soit le
  client paie plus mais reste bridé (réclamation), soit l'inverse (manque à gagner).
- Incohérence `plan`/`priceId` en base → comptabilité d'abonnement non fiable.

### Fix proposé

Déterminer le plan depuis le **price ID** (source de vérité Stripe), avec
fallback metadata :

```typescript
// Mapping construit depuis les STRIPE_PRICE_* (déjà en env — cf. OPE-11)
const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_ESSENTIEL_MONTH!]: 'essentiel',
  [process.env.STRIPE_PRICE_ESSENTIEL_YEAR!]:  'essentiel',
  [process.env.STRIPE_PRICE_PRO_MONTH!]:       'pro',
  // ... pro_year, entreprise_month/year
};
const priceId = sub.items?.data?.[0]?.price?.id;
const plan = PRICE_TO_PLAN[priceId] || planFromMetadata(sub.metadata)?.plan || 'trial';
```

### Estimation

~0,5 j — mapping price→plan + bascule de la résolution + test upgrade/downgrade portail.

---

## 🟠 HIGH 2 — Aucune idempotence : la re-livraison Stripe (at-least-once) duplique notifications et emails clients

### Problème

Stripe livre les webhooks **at-least-once** (re-livraison sur timeout/5xx, et
possibles doublons). Le handler ne stocke **aucun `event.id` traité** — il n'existe
ni table `webhook_events`, ni garde d'idempotence (`grep webhook_event|processedEvent|
idempot` côté Stripe → 0 résultat). Chaque re-livraison **rejoue** le traitement :

- `handleCheckoutSessionCompleted` (`webhookHandler.ts:166`) **crée une notification
  à chaque passage** → notifications « Paiement reçu » en double.
- `handleInvoicePaymentSucceeded` (`:350`) **renvoie un email « Paiement confirmé »**
  au client à chaque re-livraison → spam client à chaque renouvellement mensuel
  re-livré.
- `handleInvoicePaymentFailed` (`:382`) → emails « Échec de paiement » dupliqués.

La mise à jour du statut facture/subscription est idempotente (set), mais les
**effets de bord (emails, notifications) ne le sont pas**.

### Impact

- Emails transactionnels dupliqués envoyés aux clients finaux → perte de confiance,
  risque de réputation expéditeur (Resend).
- Notifications artisan en double.

### Fix proposé

1. Table `stripe_webhook_events (event_id VARCHAR PRIMARY KEY, processed_at)`.
2. En tête de `handleStripeWebhook`, après vérif signature :
   `INSERT IGNORE`; si déjà présent → `return res.json({ received: true })` sans
   retraiter. Sinon traiter puis marquer.

```typescript
const already = await db.markWebhookEventProcessed(event.id); // false si déjà vu
if (!already) return res.json({ received: true, duplicate: true });
```

### Estimation

~0,5 j — migration table + garde idempotence + test re-livraison.

---

## Hors périmètre webhook mais relevé en passant

- `factures.generatePaymentLink` (`routers.ts:1632`) **ne passe pas** `portalToken`
  (champ requis de `CreateCheckoutSessionParams`) → `success_url` =
  `/portail/undefined?paiement=succes...` : redirection cassée après paiement
  d'une facture par ce chemin. (La feature lien de paiement n'est de toute façon
  pas encore branchée dans l'UI — à corriger en même temps que son câblage.)

---

## Estimation totale

- HIGH 1 (entitlements price→plan) : ~0,5 j
- HIGH 2 (idempotence) : ~0,5 j
