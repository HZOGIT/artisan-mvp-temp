# Audit — Abonnement / Trial / Onboarding

**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

---

## 🔴 BLOCKER — 10 `STRIPE_PRICE_*` absents de env.ts (checkout upgrade cassé)

### Problème

Les 10 variables Stripe Price ID sont lues directement via `process.env.*` dans
`routers.ts` mais **ne sont pas déclarées dans `server/_core/env.ts`** (schema Zod).
Elles sont aussi absentes de `.env.local` et `.env.staging`.

Conséquences :
- Aucune validation au démarrage — l'app boot sans erreur même si les IDs sont manquants.
- À l'appel de `subscription.createCheckout`, les price IDs sont `undefined` → Stripe
  rejette la requête → `PRECONDITION_FAILED`. Le flow d'upgrade est **complètement cassé**.
- Impossible de lancer un SaaS payant sans ce flow fonctionnel.

### Preuve

- `server/routers.ts:8182-8201` :
  ```typescript
  month: process.env.STRIPE_PRICE_ESSENTIEL_MONTH,
  year:  process.env.STRIPE_PRICE_ESSENTIEL_YEAR,
  month: process.env.STRIPE_PRICE_PRO_MONTH,
  year:  process.env.STRIPE_PRICE_PRO_YEAR,
  month: process.env.STRIPE_PRICE_ENTREPRISE_MONTH,
  year:  process.env.STRIPE_PRICE_ENTREPRISE_YEAR,
  month: process.env.STRIPE_PRICE_EXTRA_USER_PRO_MONTH,
  year:  process.env.STRIPE_PRICE_EXTRA_USER_PRO_YEAR,
  month: process.env.STRIPE_PRICE_EXTRA_USER_ENT_MONTH,
  year:  process.env.STRIPE_PRICE_EXTRA_USER_ENT_YEAR,
  ```
- `server/_core/env.ts` : grep `STRIPE_PRICE` → **0 résultat**. Seuls
  `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` sont déclarés (optionnels).
- `.env.local` : aucune `STRIPE_PRICE_*`. `.env.staging` : idem.

### Fix

1. Déclarer les 10 vars dans `server/_core/env.ts` (`.optional()` pour ne pas bloquer
   les envs sans Stripe, mais logguer un warning si `NODE_ENV=production` et qu'elles
   sont absentes) :
   ```typescript
   STRIPE_PRICE_ESSENTIEL_MONTH: z.string().optional(),
   STRIPE_PRICE_ESSENTIEL_YEAR:  z.string().optional(),
   STRIPE_PRICE_PRO_MONTH:       z.string().optional(),
   STRIPE_PRICE_PRO_YEAR:        z.string().optional(),
   STRIPE_PRICE_ENTREPRISE_MONTH: z.string().optional(),
   STRIPE_PRICE_ENTREPRISE_YEAR:  z.string().optional(),
   STRIPE_PRICE_EXTRA_USER_PRO_MONTH: z.string().optional(),
   STRIPE_PRICE_EXTRA_USER_PRO_YEAR:  z.string().optional(),
   STRIPE_PRICE_EXTRA_USER_ENT_MONTH: z.string().optional(),
   STRIPE_PRICE_EXTRA_USER_ENT_YEAR:  z.string().optional(),
   ```
2. Remplacer `process.env.STRIPE_PRICE_*` par `getEnv().STRIPE_PRICE_*` dans
   `routers.ts:8182-8201`.
3. Renseigner les vraies Price IDs Stripe dans `.env.local`, `.env.staging`, `.env`
   (production). Les créer dans le Dashboard Stripe si pas encore fait.

---

## 🟡 MEDIUM — Incohérence durée du trial (30 j vs 14 j affiché)

### Problème

- `server/_core/subscriptionGuard.ts:87` — auto-crée un trial de **30 jours**.
- `server/routers.ts:8938` — l'email de bienvenue dit **"14 jours d'essai gratuit"**.

L'utilisateur reçoit en pratique 30 jours mais le message dit 14. Risque d'expectation
management (l'inverse serait un bug grave — ici c'est juste un message mensonger).

### Fix

Choisir une durée officielle et aligner les deux :
- Si trial = 30 jours : corriger l'email de bienvenue (`routers.ts:8938`).
- Si trial = 14 jours : corriger `subscriptionGuard.ts:87`.

---

## 🟡 MEDIUM — `STRIPE_WEBHOOK_SECRET` vide en dev / staging

### Problème

`.env.local:20` : `STRIPE_WEBHOOK_SECRET=` (chaîne vide). La vérification de signature
des webhooks Stripe échouerait si la valeur est vide — en pratique, si le handler
utilise `stripe.webhooks.constructEvent(body, sig, secret)` avec `secret=""`, Stripe
lèvera une exception → tous les événements subscription lifecycle (renouvellements,
expirations, upgrades) seraient silencieusement ignorés en dev/staging.

### Fix

Utiliser `stripe listen --forward-to localhost:PORT/api/stripe/webhook` (Stripe CLI)
qui génère un webhook secret local, et le mettre dans `.env.local`. Pour staging,
créer un endpoint webhook dédié dans le Dashboard Stripe et stocker son secret dans
`.env.staging`.

---

## Ce qui est bien en place

- `subscriptionGuard.ts` — architecture solide : auto-crée un trial 30j si aucune
  ligne `subscriptions`, blocage 402 à l'expiration, limite devices 403, LRU eviction.
  Conservative : attrape toutes les erreurs DB et laisse passer si problème technique.
- Whitelist procédures : `auth.*`, `subscription.*`, `devices.*`, `parametres.*`,
  `artisan.getProfile`, `system.*`, `modules.*` — ne bloque pas l'onboarding.
- Onboarding flow (4 étapes) : sélection métier → modules recommandés → skip immédiat
  disponible. `modules.completeOnboarding` et `modules.skipOnboarding` en tRPC.
- Webhook handler : gère le cycle de vie complet (checkout.completed, subscription
  created/updated/deleted) avec mise à jour DB correcte.

---

## Estimation

- BLOCKER (env vars) : ~30 min — 10 lignes dans env.ts + remplacer `process.env.*`.
- MEDIUM (trial texte) : ~5 min — 1 ligne à corriger.
- MEDIUM (webhook dev) : ~15 min — Stripe CLI + mettre le secret dans `.env.local`.
