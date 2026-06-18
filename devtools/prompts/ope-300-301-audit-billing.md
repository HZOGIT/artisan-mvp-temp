Tu es un architecte senior spécialisé en systèmes de facturation SaaS (billing) et intégrations Stripe. Ta mission est de réaliser deux audits non bloquants du billing actuel de l'ERP Operioz, sur le **new-stack**.

**Projet Linear** : Billing flexible — Reprise de contrôle de la business logic de facturation
**Issues couvertes** : OPE-300 (cartographie de l'existant) + OPE-301 (limites de flexibilité)

Le projet est dans `/home/developer/artisan-mvp-temp`. Cible : le **new-stack** (`src/`), pas le legacy (en voie de suppression) — mais signale si une brique billing vit encore uniquement côté legacy.

## Contexte

Aujourd'hui, la facturation des clients de l'ERP repose entièrement sur les **abonnements Stripe** : Stripe Checkout (`mode: subscription`) + Stripe Subscriptions + Billing Portal + webhooks pilotant la table `subscriptions`. On veut évaluer une reprise de contrôle (prélèvements off-session après SetupIntent) pour débloquer de nouveaux modes de facturation. Ces deux audits servent de base factuelle à la décision (OPE-307).

Points d'entrée connus :
- Module `src/modules/subscription/` (use-cases webhook, reader, notifier, domain)
- `src/shared/ports/stripe.ts` + `src/shared/ports/stripe-adapter.ts` (StripePort)
- `src/interface/http/stripe-webhook-route.ts`
- Tables `subscriptions` et `paiements_stripe` dans `drizzle/schema.pg.ts`
- Le `subscriptionGuard` / gating des features selon l'état d'abonnement

## ====== AUDIT 1 — OPE-300 : Cartographie complète du billing Stripe actuel ======

Documente précisément l'existant :

1. **Flux d'abonnement** : du Checkout (`mode: subscription`) à la création de la subscription, puis le cycle de vie. Qui crée quoi, quand. Fais un schéma de séquence.
2. **Surface `StripePort`** : liste chaque méthode (`createCustomer`, `createCheckoutSession`, `createInvoiceCheckout`, `createBillingPortalSession`, `setCancelAtPeriodEnd`, `retrieveSubscription`, `constructEvent`) et son usage réel dans le code.
3. **Webhooks** consommés et leurs effets exacts : `customer.subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`, `checkout.session.completed`, `payment_intent.payment_failed`, `customer.subscription.trial_will_end`. Pour chacun : quelle écriture en base, quelle notification.
4. **Modèle de données** : structure réelle des tables `subscriptions` et `paiements_stripe` (champs, états, FK artisan, index).
5. **Mapping des états** Stripe (`trialing | active | past_due | canceled | incomplete_expired`) → comportement applicatif (gating via `subscriptionGuard`). Où l'état est-il lu pour autoriser/bloquer des features ?
6. **Plans & prix** : où sont-ils définis (Stripe Prices ? env ? code ?) ? Comment un plan est associé à un artisan (champ `plan` sur `artisans` ?) ?
7. **Essai gratuit, changement de plan, annulation, remboursement** : qui les pilote (Stripe vs nous) ?
8. **Dunning / relances** : aujourd'hui, est-ce 100 % Stripe (Smart Retries, emails Stripe) ou y a-t-il du nôtre ?
9. **Inventaire du couplage Stripe Subscriptions** : tous les endroits du code qui dépendent du modèle d'abonnement Stripe (gating, dashboard, compta, emails).

**Livrable** : `docs/billing/audit-existant.md` — schéma de séquence du cycle de vie, inventaire des points de couplage, liste des décisions aujourd'hui déléguées à Stripe. Cite les chemins de fichiers et des extraits courts.

## ====== AUDIT 2 — OPE-301 : Limites de flexibilité ======

Identifie ce qu'on ne peut PAS (ou mal) faire aujourd'hui à cause de la délégation à Stripe Subscriptions. Pour chaque mode ci-dessous : faisable nativement avec Stripe Subscriptions ? avec contournements ? impossible sans reprendre la main ? Et estime la valeur business (élevée/moyenne/faible) selon le profil artisan BTP de l'ERP.

- Facturation **à l'usage / metered** (nb de factures émises, d'utilisateurs, de stockage…)
- **Hybride** : abonnement de base + usage + add-ons
- **À la carte / one-shot** combinés à l'abonnement
- **Paliers / volume / graduated pricing** sur-mesure
- **Facturation par entité** (multi-établissements d'un même artisan)
- **Remises / avoirs / gestes commerciaux** sur-mesure, crédits reportables
- **Cycles non standard** (annuel mensualisé, date fixe, prorata custom)
- **Couplage avec la facturation électronique (PA)** — émettre au client ERP une facture conforme (projet voisin)

**Livrable** : une matrice « mode de facturation × faisabilité Stripe × valeur business » (dans le même document ou `docs/billing/audit-flexibilite.md`), qui priorise les modes qui justifient (ou non) la reprise de contrôle.

## Méthode

- Base-toi sur le CODE RÉEL, pas sur des suppositions. Lis les fichiers, cite-les.
- Sois honnête : si quelque chose est déjà délégué proprement à Stripe et marche bien, dis-le (un build n'est pas toujours justifié).
- Ne code rien : ce sont des audits. Pas de modification du code applicatif.

## Fin de mission

Poste un commentaire sur OPE-300 et sur OPE-301 (Linear) résumant les conclusions principales + lien vers le(s) document(s). Signale tout élément qui orienterait fortement la décision OPE-307 (build vs delegate vs hybride).
