# Audit — Stripe SaaS : createCheckout / createPortal — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `subscription.createCheckout` (`routers.ts:8176`), `subscription.createPortal`
> (`:8271`). (Stripe **Connect** clients = OPE-6, hors périmètre.)

---

## Conclusion : endpoints sains côté isolation/redirection. Pas de BLOCKER/HIGH nouveau.

### Pas d'IDOR (customer toujours celui du tenant authentifié)

- `createPortal` : `artisanId = ctx.user.artisanId` (JWT), `sub = getSubscription(artisanId)`,
  `customer: sub.stripeCustomerId` → **le customer Stripe de l'artisan lui-même**. Aucun
  `customerId` d'entrée → impossible d'ouvrir le portail de facturation d'un autre tenant.
- `createCheckout` : `customer: customerId` dérivé de `sub?.stripeCustomerId` (own) ou
  d'un **nouveau** customer créé pour CE tenant (`:8228-8235`). `metadata.artisanId =
  String(artisanId)` (du ctx). Pas de `customerId` d'entrée.

### Pas d'origin injection (≠ OPE-76)

`return_url` / `success_url` / `cancel_url` utilisent **`process.env.APP_URL`** (pas
`ctx.req.headers.origin`) → liens de redirection sur le bon domaine, non falsifiables.

### Pas d'injection de prix Stripe

Le `priceId` vient d'une **map serveur** (`EXTRA_USER_PRICES[input.plan][input.interval]`),
`plan` validé par `z.enum(['essentiel','pro','entreprise'])` → l'appelant ne peut pas
injecter un priceId arbitraire (ex. un prix à 0 €).

---

## Réserves = déjà tracées

- `trial_period_days: 30` **inconditionnel** à chaque checkout → essai re-octroyé /
  empilable → **OPE-66**.
- Aucune garde contre un abonnement déjà actif → 2ᵉ abonnement Stripe → **OPE-75**.

---

## Verdict

`createCheckout` / `createPortal` : **customer toujours celui du tenant** (pas d'IDOR),
redirections via `APP_URL` (pas d'origin injection), prix depuis une map serveur (pas
d'injection). Les gaps de logique billing sont **déjà couverts** (OPE-66, OPE-75). **Pas
de nouvelle issue Linear.**
