# OPE-306 — Spike : migration des abonnements Stripe existants (sans interruption)

> Si on bascule vers un billing maison, il faut migrer les abonnements Stripe **actifs** sans
> interrompre la facturation **ni re-demander les cartes**. Livrable : plan progressif,
> réconciliable, rollbackable + cas limites.

## 0. Atout majeur : on ne re-collecte PAS les cartes

Les `PaymentMethod` et `customer` Stripe existants **restent réutilisables** pour des
prélèvements off-session (cf. OPE-303) : le mandat MIT initial a déjà été établi par les
abonnements actuels. On **importe** `stripe_customer_id` (déjà en base, `subscriptions.stripe_customer_id`,
cf. OPE-300 §4) + le `PaymentMethod` par défaut du customer → table `payment_mandates`
(OPE-304 §3). **Zéro friction client.** C'est ce qui rend la migration soutenable.

## 1. Reprise des dates d'ancrage (ne pas double-facturer ni sauter une période)

Pour chaque abonnement migré, on lit l'état Stripe (`retrieveSubscription`, déjà au port,
`stripe.ts:67`) : `current_period_end`. Le moteur maison **prend le relais à partir de
`current_period_end`** :
- la **dernière période** reste facturée par Stripe (déjà payée / en cours) ;
- la **première période maison** démarre exactement à `current_period_end` → **aucune
  double-facturation, aucun trou**.
- `cycleAnchor` maison = `current_period_end` de bascule.

## 2. Stratégie de bascule (cohérente avec le dual-stack existant)

Réutiliser le mécanisme **par artisan / feature flag** déjà en place dans le gateway
(`src/interface/gateway/gateway-proxy.ts` route `local`/`legacy` selon flags — cf. OPE-300 §5).
On ajoute un flag `billing.engine = stripe-subs | maison` **par artisan** :

1. **Cohorte pilote** (quelques artisans internes/volontaires) sur le moteur maison.
2. **Coexistence** : la majorité reste sur Stripe Subscriptions ; les pilotes sur maison. Le
   webhook et le gating gèrent les deux (router selon le flag).
3. **Bascule par vagues**, à la **frontière de période** de chaque artisan (à
   `current_period_end`) pour un découpage propre.
4. **Annulation côté Stripe** de la subscription migrée **à la fin de sa période** (pas
   d'annulation immédiate → pas de remboursement/prorata Stripe à gérer).

## 3. Plan de rollback

- **Pré-bascule** : rien à annuler (Stripe reste maître). Rollback = ne pas activer le flag.
- **Post-bascule, avant 1er prélèvement maison** : remettre le flag `stripe-subs`, **ré-activer**
  la subscription Stripe (ne pas l'avoir annulée tant que le 1er cycle maison n'est pas validé
  → **garder la sub Stripe en `cancel_at_period_end` plutôt que delete** pour pouvoir revenir).
- **Post 1er prélèvement maison réussi** : point de non-retour « doux » ; rollback possible
  mais nécessite réconciliation (OPE-313) pour ne pas re-facturer.
- **Règle** : on n'annule définitivement la sub Stripe **qu'après N cycles maison réconciliés**.

## 4. Cas limites (à traiter explicitement)

| Cas | Traitement |
|---|---|
| **Trial en cours** (`trialing`, essai non fini) | migrer en conservant `trial_ends_at` ; 1er prélèvement maison à la fin d'essai. Ne pas prélever pendant l'essai. |
| **`past_due`** (impayé en cours) | **ne PAS migrer** tant que non résolu (laisser Stripe Smart Retries finir) ; migrer une fois `active`. |
| **`cancel_at_period_end=true`** (annulation programmée) | migrer en respectant l'intention : pas de renouvellement maison ; laisser expirer à `current_period_end`. |
| **Add-on extra users** (`extraUsers`) | reporter `quantity` sur `billing_subscriptions.quantity` (OPE-304). |
| **Carte expirant bientôt** | déclencher un SetupIntent de rafraîchissement avant la bascule. |
| **Customer sans PaymentMethod par défaut** | bloquer la migration → demander un SetupIntent (re-collecte ponctuelle). |

## 5. Réconciliation (garde-fou)

À chaque cycle des cohortes migrées, comparer : prélèvement maison ↔ PaymentIntent Stripe,
montant attendu ↔ débité, période ↔ ancrage. Toute divergence → alerte + gel de la cohorte
(cf. OPE-313). **Aucune migration de masse sans réconciliation verte sur la cohorte pilote.**

## 6. Conclusion (entrée OPE-307)

- Migration **soutenable et réversible** grâce à : (1) réutilisation des PM/customer Stripe
  (pas de re-collecte), (2) bascule à la frontière de période (pas de double-facture), (3)
  feature flag par artisan réutilisant le dual-stack existant, (4) sub Stripe gardée en
  `cancel_at_period_end` jusqu'à réconciliation.
- **Risque principal** : les cas limites (`past_due`, trial, annulation programmée) — tous
  identifiables en base **avant** bascule. Faire piloter par cohorte.
- Alimente **OPE-312**. Pas de blocage à l'option hybride.
