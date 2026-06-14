# Audit — Pas de lien de paiement dans l'email de facture + `generatePaymentLink` non câblé — MEDIUM (OK)

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `factures.sendByEmail` (`routers.ts:1512`), `generateFactureEmail
> Content` (`emailService.ts`), `generatePaymentLink` (`routers.ts:1602`). Fait
> suite à la question « si j'envoie une facture, il y aura le lien de paiement
> dedans ? » → **non**.

---

## Constat

- **`sendByEmail`** construit le corps via `generateFactureEmailContent(...)` +
  `customMessage` optionnel, puis envoie. **Aucun lien « Payer en ligne »** n'est
  injecté. `grep lienPaiement|payer` sur `generateFactureEmailContent` → **0**.
- **`generatePaymentLink`** (`routers.ts:1602`) — un endpoint qui crée une session
  Stripe et renvoie `lienPaiement: session.url` — **n'a AUCUN appelant** :
  `grep generatePaymentLink client/src` → **0**, et `sendByEmail` ne l'appelle pas.
  → **code mort** (classe « feature morte » OPE-51/70/74).
- Seul chemin de paiement en ligne **réel** : le **portail client**
  (`/portail/:token` → bouton « Payer en ligne » → `/api/paiement/create-checkout-
  session`), qui suppose que l'artisan a généré **et** envoyé un lien de portail
  séparément.

→ Le client qui reçoit une **facture par email** n'a **pas** de bouton pour payer ;
le mécanisme de lien de paiement existe (`generatePaymentLink`) mais n'est branché
**nulle part**.

## Sévérité — MEDIUM

- Le paiement en ligne **fonctionne** via le portail → la feature n'est pas
  totalement morte (≠ OPE-74 push).
- **Gated par OPE-6** : tant que Stripe Connect n'est pas configuré, les paiements
  arrivent sur le compte plateforme (BLOCKER), donc câbler le lien email est de
  toute façon **en aval** d'OPE-6 (+ statut payable d'OPE-67).
- Impact = **conversion/UX de paiement** réduite (le canal naturel facture→email
  n'a pas de « Payer maintenant »), pas de sécurité/légal.

## Recommandation

Après OPE-6 : **injecter un bouton « Payer en ligne »** dans le corps de
`generateFactureEmailContent` pour les factures **payables** (`envoyee`/`en_retard`,
cf. OPE-67), pointant vers le portail (`/portail/<token>` ou directement le
`generatePaymentLink`). Soit appeler `generatePaymentLink` dans `sendByEmail` et
insérer l'URL, soit retirer l'endpoint mort.

---

## Verdict

Lien de paiement **absent de l'email de facture** et `generatePaymentLink` **non
câblé (mort)** → **MEDIUM** (paiement OK via portail, gated par OPE-6/OPE-67).
Reco : brancher un bouton « Payer en ligne » dans l'email post-OPE-6. **Pas d'issue
Linear** (MEDIUM, en aval d'OPE-6 ; documenté pour suite produit).
