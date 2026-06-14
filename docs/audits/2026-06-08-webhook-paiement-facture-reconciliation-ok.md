# Audit — Webhook Stripe : réconciliation paiement → facture — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `handleCheckoutSessionCompleted` / `handlePaymentFailed`
> (`webhookHandler.ts:127-197`) — passage d'une facture à `payee` après paiement
> en ligne par le client. Distinct d'OPE-28/29 (entitlements/idempotence abonnement)
> et OPE-6 (routage Connect).

---

## Conclusion : réconciliation saine. Pas de BLOCKER/HIGH nouveau.

### Pas de spoofing / IDOR

- La signature du webhook est vérifiée (`constructEvent`) en amont → l'événement
  vient bien de Stripe.
- `factureId` et `tokenPaiement` proviennent de **`session.metadata`** posée
  **côté serveur** à la création de la session (`createCheckoutSession`, dérivée
  d'une facture déjà validée en ownership) → **non contrôlables par l'attaquant**.
- Le paiement est retrouvé par `getPaiementByToken(tokenPaiement)` ; la facture par
  `factureId`. Cohérents car posés ensemble par l'endpoint de création.

### Correct fonctionnellement

- Marque `paiement.statut='complete'` + `facture.statut='payee'` +
  `montantPaye=totalTTC` + `modePaiement='carte'` + notification artisan.
- **Card-only** : l'endpoint de création force `payment_method_types: ['card']`,
  donc `checkout.session.completed` implique **paiement réellement encaissé** (pas
  de faux positif type SEPA/asynchrone).
- `handlePaymentFailed` marque `paiement.statut='echoue'`.
- Les sessions d'**abonnement** (SaaS) n'ont pas `facture_id`/`token_paiement` en
  metadata → ce handler **retourne tôt** (« Missing metadata ») → pas de
  contamination entre paiement facture et abonnement.

---

## Réserves (déjà tracées)

1. **Notification dupliquée à la re-livraison** : Stripe livre at-least-once ;
   ce handler **n'a pas de garde d'idempotence** → une re-livraison re-crée la
   notification « Paiement reçu ». Le passage `payee→payee` est inoffensif, mais
   la **notification dupliquée** relève d'**OPE-29**.
2. **`montantPaye = totalTTC` (plein)** sans réconcilier `session.amount_total` ni
   tenir compte d'un acompte → relève d'**OPE-60** (paiement partiel). Cas normal
   (paiement intégral) non impacté ; le montant a été fixé côté serveur.
3. **Bascule directe `updateFacture(statut='payee')`** (hors machine à états du
   routeur) : nécessaire pour un webhook de confiance, **mais** si un client a payé
   une facture `brouillon`/`annulee` (faille **OPE-67**), ce handler la marque
   `payee` → **aval qui complète l'exploit OPE-67**. Pas un défaut propre du
   webhook ; corrigé en bloquant en amont (OPE-67).

---

## Verdict

Réconciliation paiement→facture **fiable** : metadata serveur + signature
(pas d'IDOR/spoofing), card-only (completed = encaissé), séparation
facture/abonnement correcte. Réserves toutes **déjà tracées** (OPE-29 dup
notifications, OPE-60 montant plein, OPE-67 statut payable en amont). **Pas
d'issue Linear créée.**
