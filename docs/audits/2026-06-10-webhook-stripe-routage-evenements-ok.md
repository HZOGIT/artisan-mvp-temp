# Audit — Webhook Stripe : routage des événements (abonnement vs paiement facture) — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : `handleStripeWebhook` dispatch (`webhookHandler.ts:67-115`),
> `handleCheckoutSessionCompleted` (`:127-176`), `resolveArtisanId` (`:27`),
> handlers `customer.subscription.*` (`:204-301`).

---

## Conclusion : routage correct, pas de confusion abonnement/facture. Pas de BLOCKER/HIGH **nouveau**.

### Séparation nette des deux flux par **métadonnées + type d'événement**

Le même type `checkout.session.completed` est émis pour un **paiement de facture** ET un
**checkout d'abonnement**. La distinction est sans ambiguïté :

- `handleCheckoutSessionCompleted` (`:127`) lit `session.metadata.token_paiement` +
  `facture_id`. **Absents** (= session d'abonnement) → `return` propre (`:133-136`),
  **aucune action** sur les factures.
- Les abonnements sont traités **uniquement** par les événements **séparés**
  `customer.subscription.created/updated/deleted/trial_will_end` (`:91-104`).

→ Pas de risque qu'un paiement d'abonnement marque une facture « payée », ni l'inverse.
Les chemins de **création** des sessions posent des métadonnées disjointes
(`facture_id`/`token_paiement` pour les factures ; `plan`/`artisanId` pour l'abonnement).

### Isolation correcte (pas d'IDOR via webhook)

- `factureId` vient des **métadonnées posées côté serveur** lors de `createCheckoutSession`
  (où `facture.clientId === access.clientId` a déjà été vérifié), et le webhook est
  **signature-vérifié** → la facture marquée payée est la bonne. `paiement` retrouvé par
  **token** (`getPaiementByToken`).
- `resolveArtisanId` (`:27`) : `metadata.artisanId` **ou** repli sur le `customerId` de
  notre table `subscriptions` → robuste, scopé.

### Montant

`montantPaye: facture.totalTTC` (`:159`) = montant **plein** ; la session Stripe a été
créée pour le `totalTTC` exact → cohérent (pas de paiement partiel via lien Stripe).

---

## Écarts = déjà filés (anti-doublon)

1. **Idempotence** : une re-livraison Stripe de `checkout.session.completed` ré-exécute le
   handler → `updateFacture` idempotent mais **`createNotification` dupliquée** (`:166`)
   → **déjà filé** (« Webhook : aucune idempotence → duplique notifications/emails »).
2. **Atomicité** : `updatePaiement` + `updateFacture` + `createNotification` = 3 écritures
   non transactionnelles (`:147-172`) → **OPE-84** (transactions).
3. **Entitlements** : `planFromMetadata` (`:18`) dérive le plan de `metadata.plan` et non
   du price ID → **déjà filé** (« entitlements dérivés de metadata.plan »).
4. Signature **fail-open** (`secret || ''`) → **déjà filé**.

### Réserve LOW

- Pour une session d'abonnement, `handleCheckoutSessionCompleted` logge
  `console.error('Missing metadata')` (`:134`) — **faux négatif** bénin (bruit de log),
  pas une erreur réelle. À abaisser en `debug`.

---

## Verdict

Le webhook **route correctement** paiements de factures (`facture_id`/`token_paiement`) et
abonnements (`customer.subscription.*`) — **pas de confusion**, isolation via métadonnées
serveur + signature. Les écarts (idempotence, atomicité OPE-84, entitlements, fail-open)
sont **tous déjà filés**. **Pas de nouvelle issue Linear.**
