# Audit — Webhook Stripe : vérification de signature (fail-open sur secret absent) → OPE-79

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : route `/api/stripe/webhook` (`index.ts:146`), `handleStripeWebhook`
> (`webhookHandler.ts:40-65`), `constructWebhookEvent` (`stripeService.ts:124-132`),
> `ENV.stripeWebhookSecret` (`env.ts:118`). Vecteur recherché : forge de webhook
> (signature non vérifiée / vérifiable avec secret vide).

---

## Ce qui est correct (vérification solide quand le secret est présent)

- Route montée avec `express.raw({ type: 'application/json' })` **avant**
  `express.json()` (`index.ts:145-146`) → **corps brut** préservé pour le HMAC.
- Rejet si header `stripe-signature` absent (`webhookHandler.ts:43-46`).
- `constructWebhookEvent` → `stripe.webhooks.constructEvent` (`stripeService.ts:131`),
  **rejet 400** si la vérification échoue (`:56-59`).
- Le shortcut `evt_test_` (`:62-65`) est **post-vérification** → non exploitable (un
  attaquant ne peut pas produire d'event `evt_test_` signé sans le secret).
- `STRIPE_WEBHOOK_SECRET` **est** présent dans `.env.staging` et `.env.local` → pas
  d'exploit actif sur ces environnements.

## 🟠 HIGH trouvé → **OPE-79** (issue créée)

**Fail-open sur secret manquant** :
```typescript
// webhookHandler.ts:51-55
event = constructWebhookEvent(req.body, signature, ENV.stripeWebhookSecret || '');
```
`constructEvent(payload, sig, '')` n'échoue **pas** sur un secret vide → il calcule
`HMAC-SHA256('', payload)`. Si `STRIPE_WEBHOOK_SECRET` est **absent** (prod mal
configurée), un attaquant peut forger une signature valide (clé HMAC = chaîne vide,
connue) et faire accepter **n'importe quel événement** : `customer.subscription.updated`
(plan=entreprise, combiné OPE-28) → **premium gratuit** ; `checkout.session.completed`
→ abonnement actif sans paiement.

Aucune garde **fail-closed** (`grep if (!secret)` → 0) ; le `|| ''` masque la
mauvaise config au lieu de la signaler.

**Fix** (cf. OPE-79) : rejeter le webhook (500/503) si le secret est vide/absent ;
validation d'env stricte au boot en production.

### Calibrage — HIGH (pas BLOCKER)

La vérification **fonctionne** quand le secret est posé (cas staging/local). Le risque
ne se matérialise qu'en cas de **prod sans secret** — mais il existe des précédents de
secrets manquants (OPE-69 Resend, OPE-15 Twilio). Fix trivial, conséquence sévère →
HIGH (cohérent avec OPE-69, même pattern fail-open).

---

## Anti-doublon

- **OPE-28** (entitlements depuis metadata) et **OPE-29** (idempotence) = logique
  **post-vérification**, supposent l'événement authentique.
- **OPE-69** = fail-open équivalent côté **emails** (Resend).
→ Aucune issue ne couvre le fail-open de la **signature webhook** → **OPE-79 créée**.

---

## Verdict

Vérification de signature webhook **correcte avec secret présent** (raw body, rejets
appropriés), mais **fail-open** `secret || ''` → webhooks forgeables si
`STRIPE_WEBHOOK_SECRET` absent en prod → **OPE-79 (HIGH)**. Fix : fail-closed +
validation d'env au démarrage.
