# OPE-305 — Spike : dunning / relances maison

> Le dunning (récupération des paiements échoués) est **ce que Stripe Smart Retries fait de
> mieux**. Si on reprend la main, mal le faire = **churn involontaire** (revenu perdu
> silencieusement). Objectif : concevoir un dunning maison crédible + estimer le **delta de
> churn** vs Stripe.

## 0. Point de départ (existant)

Aujourd'hui : sur `invoice.payment_failed` on passe `past_due` + **1** notif + **1** email,
**sans retry ni suspension** de notre côté ; la récupération est **100 % déléguée aux Smart
Retries Stripe** (cf. OPE-300 §8). En reprenant la main, **ce filet disparaît** → il faut le
recréer. **Rien dans `src/` ne planifie de tâche** (pas de cron/queue) → dépendance infra forte.

## 1. Stratégie de retries

- **Calendrier** : J+0 (échec initial), **J+1, J+3, J+5, J+7** (4 retries), puis abandon →
  `canceled`. Backoff modéré aligné sur les fenêtres bancaires (réapprovisionnement, déblocage).
- **Fenêtre horaire** : prélever en journée ouvrée (taux d'acceptation meilleur ; éviter nuit/we).
- **Période de grâce** : accès **maintenu** pendant `past_due` (J0→J7) ; suspension (402 via le
  gating, cf. OPE-300 §5) **seulement** à l'abandon (`canceled`/`expired`). Évite de punir un
  impayé transitoire (cas fréquent BTP : trésorerie en dents de scie).
- **Idempotence** : chaque tentative a une `idempotencyKey` distincte
  (`charge:{invoiceId}:{attemptNo}`) — un retry ≠ un double-prélèvement (cf. OPE-303).

## 2. Parcours par type d'échec (déterminant pour le taux de récupération)

| `decline_code` / cas | Cause | Action maison | Re-tentative auto ? |
|---|---|---|---|
| `insufficient_funds` | trésorerie | retry au calendrier | ✅ oui (meilleur ROI) |
| `card_declined` (générique) | divers | retry au calendrier | ✅ oui |
| `expired_card` | carte périmée | **email "mettez à jour la carte"** (nouveau SetupIntent) | ❌ non (inutile) |
| `authentication_required` | 3DS exigé off-session | **relance on-session 3DS** (clientSecret, cf. OPE-303) | ❌ off-session ; ✅ on-session |
| `lost_card`/`stolen_card`/`do_not_honor` | bloqué définitif | demande nouveau moyen de paiement | ❌ non |

> Le **branchement par cause** (≠ retry aveugle) est ce qui sépare un dunning efficace d'un
> dunning qui brûle des tentatives. C'est la partie la plus subtile à coder.

## 3. Communication & machine à états

```
active ──échec──▶ past_due ──(retry J1/J3/J5/J7 échouent)──▶ canceled (→ gating 402)
   ▲                  │  │
   └──retry réussi────┘  └── expired_card/auth_required ─▶ action client (update PM / 3DS on-session)
```

- **Emails/notifs** : J0 « paiement échoué », J3 « 2e tentative », J5 « action requise »,
  J7 « dernière chance avant suspension ». Réutiliser `SubscriptionEventNotifier`
  (`webhook-use-cases.ts` : notif in-app + email best-effort, déjà en place).
- **Récupération** : lien vers mise à jour du moyen de paiement (nouveau SetupIntent OPE-303) ;
  dès qu'un PM valide est posé → reprélever immédiatement la facture en souffrance.

## 4. Dépendance d'infra (bloquante)

Le dunning **exige** :
- un **scheduler** (déclenche les retries échus) — **absent du new-stack** ;
- un **outbox / exactly-once** (ne pas prélever deux fois sur un rejeu de job) ;
- un **journal de tentatives** (`billing_charge_attempts`, cf. OPE-304 §3).

→ **À mutualiser avec l'infra de jobs du projet PA** (outbox/scheduler de transmission). C'est
le **même prérequis** que le moteur de cycles (OPE-309). À chiffrer une seule fois.

## 5. Delta de churn involontaire vs Stripe Smart Retries

- Stripe Smart Retries = ML sur des milliards de transactions, timing optimisé par réseau
  bancaire. **On ne l'égalera pas** sur le timing fin.
- Mais l'essentiel du gain vient de **2 leviers simples** qu'on maîtrise : (1) **retry
  `insufficient_funds`** sur quelques jours, (2) **relance `expired_card`/`auth_required`
  ciblée**. Un dunning maison « raisonnable » (calendrier fixe + branchement par cause)
  récupère la **majeure partie** de ce que récupère Smart Retries.
- **Estimation** : delta de churn involontaire **faible-modéré** (quelques points sur la
  fraction d'impayés, eux-mêmes une petite part du revenu). **Acceptable** pour le profil BTP
  (faible volume, ARPU correct), à condition de **mesurer** (OPE-313 : taux de récupération).
- **Mitigation pragmatique** : possibilité de **garder Stripe sur le timing** en V1 (laisser
  Stripe retenter via une sub résiduelle) — mais ça complique l'hybride. Recommandé : dunning
  maison **simple** dès V1 + métrique de récupération, et n'optimiser que si le delta mesuré le
  justifie.

## 6. Conclusion (entrée OPE-307)

- Faisable, mais c'est **le poste de risque n°1** du build (avec l'exactitude monétaire).
- **Prérequis dur** : infra de jobs/outbox (inexistante) — à mutualiser PA.
- **Reco V1** : calendrier fixe J1/J3/J5/J7 + branchement par cause + période de grâce +
  suspension à l'abandon, et **instrumenter le taux de récupération** pour décider d'investir
  plus. Ne PAS viser la parité Smart Retries d'emblée. Alimente **OPE-310**.
