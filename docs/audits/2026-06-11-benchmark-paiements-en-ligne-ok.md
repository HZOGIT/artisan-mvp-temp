# Benchmark — Paiements en ligne (`paiements_stripe`) vs Odoo `payment` : modèle adéquat, gaps déjà tracés

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : table `paiements_stripe` (`schema.ts:511`) + endpoints
> `/api/paiement/create-checkout-session` (`index.ts:830`) / `facture.payer` (`routers.ts:1728`)
> ↔ Odoo `payment` (`payment.transaction`).

---

## Conclusion : modèle de transaction **adéquat pour un MVP**. Les écarts réels sont **tous déjà tracés** dans « Lancement 30 juin » — pas de nouveau ticket benchmark.

### ✅ Modèle de transaction en ligne présent

`paiements_stripe` : `factureId`, `stripeSessionId`, `stripePaymentIntentId`, `montant`,
`devise`, `statut` (`en_attente`/`complete`/`echoue`/`rembourse`), `lienPaiement`,
`tokenPaiement`, `paidAt`. → couvre l'essentiel : lien de paiement par facture, suivi de la
session/intention Stripe, statut + horodatage, remboursement.

### Correspondance avec Odoo `payment.transaction`

`odoo-ref/addons/payment/models/payment_transaction.py:65` : `state`
(`draft`/`pending`/`authorized`/`done`/`cancel`/`error`). Notre `statut`
(`en_attente`/`complete`/`echoue`/`rembourse`) en est l'équivalent **simplifié** — suffisant
MVP. Les états `authorized` (capture manuelle) et les **tokens de carte enregistrés**
(`payment.token`) sont de l'**ERP**, hors périmètre artisan.

### Écarts réels — **déjà filés dans le projet Lancement** (anti-doublon)

| Gap | Issue existante |
| -- | -- |
| **L'artisan reçoit le paiement** (Stripe Connect multi-tenant) — sinon l'encaissement va sur le compte Operioz | **OPE-6** (exclu du ré-audit, **le** blocker du domaine) |
| Facture brouillon/annulée payable + portail exposant les brouillons | **OPE-67** |
| Webhook Stripe : idempotence / fail-open / entitlements depuis price ID | **OPE-29 / OPE-79 / OPE-28** |
| Emails (faux succès si Resend absent) | **OPE-69** |

→ Le domaine est **bloqué fonctionnellement par OPE-6** (sans Connect, le paiement en ligne
de facture n'arrive pas à l'artisan), et ses défauts techniques sont déjà couverts. Il n'y a
**pas d'amélioration de modèle de données** à proposer côté benchmark : ajouter des champs
(authorized, tokens, capture partielle) serait de la **sur-ingénierie** avant même que le flux
de base (Connect) soit en place.

---

## Verdict

Le modèle **paiements en ligne** (`paiements_stripe`) est **adéquat pour un MVP** et
correspond, en simplifié, à `payment.transaction`. Tous les écarts à valeur (réception par
l'artisan, sécurité webhook, brouillons payables) sont **déjà tracés** dans « Lancement
30 juin » (OPE-6/67/28/29/79/69). **Aucun nouveau ticket benchmark** — le domaine est
*model-complete* au niveau MVP et **bloqué en amont par OPE-6** (à traiter en priorité côté
lancement, pas côté benchmark).
