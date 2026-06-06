# Audit — Paiements multi-tenant (Stripe Connect)

**Sévérité : 🔴 BLOCKER lancement** — modèle économique cassé + risque légal.
**Date** : 2026-06-06 · **Projet** : Lancement 30 juin

## Problème
Quand un artisan envoie un devis/facture avec lien de paiement, le client paie
**sur le compte Stripe de la plateforme (Operioz)**, pas sur celui de l'artisan.
L'argent des clients de l'artisan atterrit chez nous. L'artisan ne reçoit rien
directement → impossible en l'état de lancer (on encaisse l'argent d'autrui).

## Preuve (code actuel)
- `server/stripe/stripeService.ts:10-17` — `getStripe()` instancie Stripe avec
  **une seule clé plateforme** `process.env.STRIPE_SECRET_KEY`.
- `server/stripe/stripeService.ts:73` — `getStripe().checkout.sessions.create({…})`
  crée la session **sans** `stripeAccount` (header Stripe-Account), **sans**
  `on_behalf_of`, **sans** `transfer_data.destination`, **sans**
  `application_fee_amount`. → charge directe 100 % sur le compte plateforme.
- Aucune trace de Stripe Connect dans tout le code (`accounts.create`,
  `account_links`, `stripe_account_id`, `transfer_data`, …) — **inexistant**.
- `drizzle/schema.ts` (table `artisans`) — **aucune colonne** `stripe_account_id`
  / statut d'onboarding Connect.

> Note : le 2ᵉ checkout (`server/routers.ts:8239`, `mode: 'subscription'`) est
> l'abonnement SaaS de l'artisan **à** Operioz — lui est correctement sur le
> compte plateforme. Le bug concerne uniquement les paiements **devis/factures**.

## Fix proposé — Stripe Connect
1. **Onboarding** : pour chaque artisan, créer un compte connecté
   (`accounts.create({ type: 'express' })`) + `account_links.create` pour le flux
   d'onboarding hébergé. Stocker `stripe_account_id` + `charges_enabled` /
   `payouts_enabled` sur `artisans` (nouvelle migration).
2. **Checkout** : créer la session de paiement facture **sur le compte de
   l'artisan**, deux options :
   - *Direct charge* : `stripe.checkout.sessions.create({…}, { stripeAccount: artisan.stripe_account_id })`
     + `payment_intent_data.application_fee_amount` (commission Operioz).
   - *Destination charge* : `payment_intent_data: { on_behalf_of, transfer_data: { destination } , application_fee_amount }`.
3. **Webhooks** : gérer les events **Connect** (`account.updated`,
   `payment_intent.succeeded` avec `account`), vérifier la signature, idempotence.
4. **Garde-fous** : empêcher l'envoi d'un lien de paiement si l'artisan n'a pas
   terminé l'onboarding (`charges_enabled === true`). Sinon message clair.
5. **UI** : écran "Configurer mes paiements" (statut Connect) dans les paramètres.

## Impact si non corrigé
- L'argent des clients finaux est encaissé par Operioz → obligations légales,
  KYC, flux de fonds non autorisés, remboursements à la charge de la plateforme.
- Aucun artisan ne peut réellement être payé → produit non lançable.

## Estimation
Gros morceau (onboarding + checkout Connect + webhooks + migration + UI).
À prioriser tout en haut du backlog "Lancement 30 juin".
