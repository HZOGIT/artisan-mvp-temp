# Audit — Changement de plan : `createCheckout` crée un 2ᵉ abonnement → double facturation

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `subscription.createCheckout` (`routers.ts:8167`) + UI
> `AbonnementSection.tsx`. Distinct d'OPE-28 (entitlements après changement de
> plan), OPE-66 (trial), OPE-40 (factures **client**).

---

## 🟠 HIGH — Un abonné actif qui change de plan est **doublement facturé**

### Problème

`createCheckout` crée **toujours** un nouvel abonnement Stripe, **sans vérifier**
qu'un abonnement actif existe déjà :

```typescript
// routers.ts:8218-8256 — réutilise le Customer, mais aucune garde sur sub.stripeSubscriptionId / status
let customerId = sub?.stripeCustomerId || null;   // réutilisé
// ... aucun if (sub.stripeSubscriptionId && status actif) ...
const session = await stripeClient.checkout.sessions.create({
  customer: customerId,
  mode: 'subscription',          // ← crée un ABONNEMENT supplémentaire
  line_items: lineItems, ...
});
```

Côté UI (`AbonnementSection.tsx`), **chaque carte de plan ≠ plan courant** déclenche
`createCheckout` (le plan courant seul est désactivé) :

```tsx
// AbonnementSection.tsx:317-322
onClick={() => checkoutMut.mutate({ plan: def.id, interval, extraUsers })}
disabled={current || checkoutMut.isPending}   // current = isCurrentPlan(def)
{current ? "Plan actuel" : `Choisir ${def.name}`}
```

→ Un artisan **déjà abonné** (ex. Essentiel `active`) qui clique « Choisir Pro »
appelle `createCheckout` → Stripe crée un **2ᵉ abonnement actif** sur le même
Customer. Le client a alors **deux abonnements** (Essentiel **+** Pro) et est
**facturé deux fois**.

### Aggravation

- La DB ne stocke **qu'un** `stripeSubscriptionId` : le webhook
  `subscription.created` du nouvel abonnement **écrase** l'ancien id → l'**ancien
  abonnement devient orphelin** dans Stripe (invisible dans l'app) mais **continue
  de facturer** le client.
- Combiné à **OPE-66** : le nouvel abonnement repart avec **30 j d'essai** → l'app
  affiche « trialing/Pro » pendant que l'ancien Essentiel facture toujours.

### Impact

**Double facturation des clients** au changement de plan → litiges,
remboursements, chargebacks, perte de confiance. Pour un upgrade/downgrade, c'est
le **chemin nominal** de l'UI (les cartes de plan), donc déclenché facilement.

### Fix proposé

1. **Serveur** : dans `createCheckout`, si `sub.stripeSubscriptionId` existe et
   `status ∈ {active, trialing, past_due}` → **ne pas** créer de checkout ;
   effectuer un **changement de plan en place** :
   `stripe.subscriptions.update(subId, { items: [{ id: itemId, price: newPrice }],
   proration_behavior: 'create_prorations' })`. Sinon (aucun abonnement actif),
   garder le checkout (1ʳᵉ souscription / ré-abonnement après annulation).
2. **UI** : pour un abonné actif, router les cartes « Choisir … » vers le
   **changement de plan** (update/portail) et non `createCheckout` ; réserver
   `createCheckout` à la 1ʳᵉ souscription.

### Estimation

~0,5 j — garde + branche `subscriptions.update` (proration) côté serveur + routage
UI + test (Essentiel actif → Pro : 1 seul abonnement, proraté).

---

## Estimation totale

- HIGH (changement de plan → double abonnement / double facturation) : ~0,5 j
