# Audit — Paywall : abonnements en échec de paiement gardent un accès complet

**Date** : 2026-06-07 · **Projet** : Lancement 30 juin

> Périmètre : application server-side du paywall (`subscriptionGuard.ts`) vs.
> statuts écrits par le webhook Stripe (`stripe/webhookHandler.ts`). Distinct
> d'OPE-43 (gating **modules** auto-déclaré via onboarding), OPE-28 (quel plan,
> dérivé de metadata) et OPE-29 (idempotence). Ici : **quel statut bloque l'accès**.

---

## Ce qui fonctionne correctement

- Le paywall est **réellement appliqué côté serveur** : `subscriptionGuard()` est
  un middleware Express monté sur `/api/trpc` (`index.ts:1272`) — pas un simple
  garde-fou client. Une route non whitelistée d'un compte expiré reçoit **402**.
- Auto-création d'un trial 30 j si aucune ligne subscription ; whitelist correcte
  (auth/subscription/parametres/devices) pour permettre le ré-abonnement.

---

## 🟠 HIGH — Un abonnement `past_due` / `unpaid` conserve un accès complet (fuite de revenu)

### Problème

Le webhook traduit les statuts Stripe ainsi :

```typescript
// webhookHandler.ts:226-230
const internalStatus =
  stripeStatus === 'trialing' ? 'trialing' :
  stripeStatus === 'past_due' ? 'past_due' :
  stripeStatus === 'canceled' || stripeStatus === 'incomplete_expired' ? 'canceled' :
  'active';                              // ← 'unpaid', 'incomplete' → 'active'
```

et `invoice.payment_failed` bascule explicitement en `past_due` :

```typescript
// webhookHandler.ts:376
await db.updateSubscription(existing.artisanId, { status: 'past_due' });
```

Mais le **guard** ne bloque QUE trois cas :

```typescript
// subscriptionGuard.ts:101-110
const isExpired =
  sub?.status === "expired" ||
  (sub?.status === "canceled" && sub.currentPeriodEnd < now) ||
  (sub?.status === "trialing" && sub.trialEndsAt < now);
// ← 'past_due' n'est JAMAIS bloqué ; 'active' (issu de 'unpaid'/'incomplete') non plus
```

Conséquences :

1. **`past_due`** (carte expirée / provision insuffisante au renouvellement) →
   l'artisan garde **un accès complet** pendant toute la phase de relance Stripe
   (dunning), qui peut durer **plusieurs semaines** selon les réglages.
2. **`unpaid`** (état terminal de relance quand la facture n'est pas marquée
   « irrécouvrable ») → mappé en **`internalStatus = 'active'`** : l'abonnement
   apparaît **payé** dans le système et **n'expirera jamais** (le scheduler ne
   bascule en `expired` que les `trialing`, `index.ts:1352`). **Accès gratuit
   permanent.**
3. `incomplete` → également `'active'` (cas de paiement initial non finalisé).

### Impact

**Fuite de revenu directe après la conversion des essais** (les premiers trials
de 30 j expirent ~fin juillet) : tout client dont le paiement récurrent échoue
continue d'utiliser le produit sans payer — indéfiniment dans le cas `unpaid`.
Le paywall, par ailleurs correctement appliqué côté serveur, est **neutralisé par
le mapping de statut**.

### Fix proposé

1. Traiter `past_due` comme bloquant dans `subscriptionGuard` **après un délai de
   grâce** (ex. bloquer si `past_due` ET `currentPeriodEnd < now - grace`), pour
   ne pas couper au premier échec transitoire mais fermer la fenêtre d'abus.
2. **Ne pas mapper `unpaid` / `incomplete` vers `active`** : ajouter
   `stripeStatus === 'unpaid' ? 'unpaid'` (nouveau statut bloquant) et
   `incomplete → incomplete` (non actif), et les traiter comme expirés dans le
   guard.
3. Tests : simuler `invoice.payment_failed` → `past_due` → vérifier 402 après le
   délai de grâce ; `unpaid` → 402 immédiat.

### Estimation

~0,5 j — élargir le mapping de statut + la condition `isExpired` + délai de grâce
+ tests webhook.

---

## 🟡 MEDIUM (documenté) — les routes Express brutes `/api/*` sont hors du guard

`subscriptionGuard` n'est monté que sur `/api/trpc` (`index.ts:1272`). Les routes
brutes (`/api/assistant/stream`, `/api/voice/token`, PDF/exports) **ne vérifient
pas l'abonnement** → un compte expiré peut continuer à générer des PDF, exporter,
et **consommer l'assistant IA (coût Gemini)**. Le volet « coût assistant sans
limite » recoupe OPE-24 ; le volet « accès post-expiration » est à corriger en
ajoutant un check d'abonnement sur ces routes (ou en les passant derrière le même
garde).

---

## Estimation totale

- HIGH (past_due/unpaid gardent l'accès) : ~0,5 j
- MEDIUM (routes brutes hors guard) : ~0,5 j (recoupe OPE-24 pour l'assistant)
