# Audit — Checkout abonnement : `trial_period_days: 30` inconditionnel → essais gratuits empilables

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `subscription.createCheckout` / `createPortal` / `cancel`
> (`routers.ts:8167-8294`) — facturation **SaaS** (abonnement Operioz), distinct
> d'OPE-6 (Stripe Connect paiements clients de l'artisan).

---

## Ce qui fonctionne correctement

- **Pas de price tampering** : le client ne choisit qu'un `plan` (enum) + `interval`
  (enum) + `extraUsers` (0–50) ; les **Price IDs viennent de l'env serveur**
  (`PRICES`/`EXTRA_USER_PRICES`), jamais de l'input. ✓
- **`createPortal`** : ouvre le portail Stripe du **`stripeCustomerId` de l'artisan
  appelant** (résolu via `ctx.user.artisanId`) — pas d'IDOR. ✓
- **`cancel`** : scopé sur `sub.stripeSubscriptionId` de l'artisan. ✓
- Le `customerId` est réutilisé/rattaché à l'artisan (`metadata.artisanId`). ✓

---

## 🟠 HIGH — `trial_period_days: 30` appliqué **à chaque** checkout → mois gratuits illimités

### Problème

`createCheckout` ajoute **systématiquement** un essai de 30 jours au niveau Stripe,
**sans jamais vérifier si l'artisan a déjà bénéficié d'un essai** :

```typescript
// routers.ts:8245-8252
subscription_data: {
  trial_period_days: 30,              // ← INCONDITIONNEL, à chaque session
  metadata: { artisanId, plan, extraUsers },
},
```

Deux conséquences :

1. **Double essai dès la 1ʳᵉ conversion.** À l'inscription, l'artisan a déjà un
   **essai applicatif de 30 j** (auto-créé : `subscriptionGuard` pose
   `status='trialing'`, `trialEndsAt = +30 j`, et le scheduler expire ces trials).
   Quand il « s'abonne », `createCheckout` lui accorde **30 jours Stripe
   supplémentaires** (carte enregistrée mais **0 € prélevé** pendant l'essai) →
   **≥ 60 jours gratuits** au lieu de 30.

2. **Empilement illimité (trial stacking).** Aucune trace « cet artisan/Customer a
   déjà eu son essai ». Boucle gratuite :
   `createCheckout` → essai 30 j (0 €) → `cancel` (ou portail) avant la fin → à la
   fin de période, l'abonnement est annulé → `createCheckout` de nouveau → **encore
   30 j gratuits** → … Le même `stripeCustomerId` ré-obtient un essai à chaque
   souscription. **Usage gratuit perpétuel de la plateforme.**

### Impact

**Fuite de revenu directe sur le produit SaaS** : tout artisan un minimum motivé
peut utiliser Operioz **sans jamais payer** (renouvellement de l'essai par
cancel/re-souscription), et **tous** obtiennent de facto 60 j gratuits minimum.
Se manifeste dès la fin des premiers essais (~fin juin/juillet).

> Distinct d'OPE-64 (accès maintenu en `past_due`/`unpaid`), OPE-43 (gating
> modules auto-déclaré) et OPE-65 (sièges non comptés) : ici c'est la **période
> d'essai elle-même** qui est ré-octroyée sans condition.

### Fix proposé

Option A (la plus simple, recommandée) — **ne pas remettre d'essai Stripe** :
l'essai de 30 j est déjà assuré au niveau applicatif avant le checkout. Retirer
`trial_period_days` (le checkout démarre alors un abonnement payant immédiat, ce
qui est cohérent : l'artisan a déjà eu ses 30 jours).

Option B — **essai conditionnel, une seule fois** : persister un drapeau
`essaiConsomme` (ou lire `sub.trialEndsAt`/l'historique Customer) et ne passer
`trial_period_days: 30` **que si l'artisan n'a jamais eu d'essai** ; sinon
`trial_period_days` absent.

(+ idéalement, à la création du Customer Stripe, exploiter la prévention de
ré-essai côté Stripe — mais la garde applicative reste nécessaire.)

### Estimation

~0,5 j — retrait inconditionnel **ou** drapeau `essaiConsomme` + condition + test
(souscrire → annuler → re-souscrire ne redonne pas d'essai).

---

## Estimation totale

- HIGH (essais gratuits empilables / double essai) : ~0,5 j
