# OPE-307 — Décision : Stripe Subscriptions vs billing maison off-session

> Note de décision synthétisant les audits (OPE-300/301/302) et les spikes (OPE-303/304/305/306).
> **Trancher** : garder Stripe Subscriptions, reprendre le contrôle complet, ou **hybride**
> (Stripe Payments + cycles maison) ? + **périmètre V1**.

## 1. Recommandation

**Option retenue : HYBRIDE** — déléguer **prélèvement + conformité** à Stripe (Payments /
off-session via SetupIntent) et **internaliser la business logic** (cycles, facture conforme,
crédits/avoirs, dunning). C'est l'option qui maximise la valeur métier débloquée par unité de
risque, et qui **améliore** la réversibilité (la dépendance passe de « Subscriptions », un
verrou produit, à « Payments », une commodité interchangeable).

**NON retenu** :
- *Tout garder sur Stripe Subscriptions* → ne débloque pas les 3 vraies valeurs (facture PA,
  avoirs/crédits, cycles FR). Le projet n'aurait pas lieu d'être.
- *Build complet (PSP maison)* → coût/risque PCI/SCA injustifiés ; aucune valeur BTP en plus
  de l'hybride.
- *Déléguer aussi la conformité e-invoicing à Stripe + un connecteur PDP tiers (type Billit,
  cf. page Stripe Factur-X)* → techniquement possible (Stripe ne fait pas Factur-X nativement
  mais des partenaires PDP existent sur son Marketplace). **Écarté car** : (a) le moteur
  Factur-X + PDP est déjà construit pour les factures artisan→client (projet PA / EPIC OPE-227)
  → le réutiliser pour le SaaS est quasi gratuit, alors qu'un connecteur tiers = dépendance
  payante redondante ; (b) ça ne débloque ni les avoirs/crédits/gestes commerciaux ni les
  cycles FR (les 2 autres drivers). **Conservé comme option de repli** si on veut éviter le
  build de la brique facture.

## 2. Pourquoi (croisement des entrées)

| Critère | Constat | Source |
|---|---|---|
| **Valeur business** | Forte uniquement sur **facture électronique PA**, **avoirs/crédits/gestes commerciaux**, **cycles FR (annuel mensualisé)**. Faible sur metered/paliers/hybride simple (Stripe suffit). | OPE-301 |
| **Effort** | V-complète ~12–15 sem ; **V1 ciblée ~5–6 sem** + infra jobs ~1 sem. Vrai coût = proration + crédits + dunning. | OPE-304 |
| **Risque conformité** | **Neutralisé** en hybride : PCI SAQ-A, SCA initial, MIT, chargebacks restent chez Stripe. À réinternaliser = métier (mandat, TVA, facture) — maîtrisable. | OPE-302 |
| **Risque revenu (dunning)** | Poste n°1 : on perd Smart Retries. Delta churn faible-modéré si dunning « raisonnable » + mesuré. | OPE-305 |
| **Faisabilité technique** | Off-session SetupIntent **confirmée par construction** (API standard, on opère déjà Stripe). Idempotence + centimes + `requires_action` = exigences claires. | OPE-303 |
| **Réversibilité** | Migration sans re-collecte de carte, bascule par cohorte/flag, rollback tant que sub Stripe en `cancel_at_period_end`. | OPE-306 |

**Driver décisif** : la **facturation électronique (PA)** — émettre à l'artisan une facture
SaaS **conforme** est **impossible** tant qu'on délègue à Stripe (OPE-301 §8), et le **moteur
de factures conformes existe déjà** dans l'ERP (`src/modules/factures/`, `typeDocument=avoir`,
trajectoire Factur-X). On réutilise, on ne réinvente pas. C'est une valeur **réglementaire**,
pas une préférence.

## 3. Périmètre V1 (validé pour débloquer l'implémentation)

**Inclus** :
1. **Infra de jobs/outbox/scheduler** (prérequis, **inexistant** — à mutualiser avec PA).
2. **SetupIntent + mandat** (OPE-308) : collecte on-session, stockage `payment_mandates`,
   réutilisation des PM/customer existants.
3. **Facture SaaS PA-conforme** via le module `factures` (TVA, mentions, numérotation, Factur-X).
4. **Crédits / avoirs / gestes commerciaux** (`typeDocument=avoir` + `billing_credits`, FIFO).
5. **Prélèvement off-session** piloté (OPE-309, partie charge) : idempotent, centimes entiers.
6. **Dunning minimal** (OPE-310) : J1/J3/J5/J7 + branchement par cause + période de grâce.
7. **Réconciliation Stripe↔maison** (OPE-313, socle).
8. **Migration cohorte pilote** (OPE-306/312), réversible.

**Exclu de V1 (V2, faible valeur BTP)** :
- Proration fine upgrade/downgrade en cours de période → garder le changement de plan **à la
  frontière de période** en V1 (pas de prorata).
- **Metered / usage**, **paliers tiered** → déléguables à Stripe si besoin (OPE-301 : config).
- Multi-établissements (refonte data-model) → uniquement si le segment le justifie.
- Parité Smart Retries → mesurer d'abord, optimiser ensuite.

## 4. Garde-fous (conditions de réussite)

- **Centimes entiers** partout (pas de float/`numeric` dans le chemin monétaire).
- **Idempotence** stricte des prélèvements (clé métier `charge:{invoiceId}:{attempt}`).
- **Réconciliation verte** sur la cohorte pilote **avant** toute bascule de masse ; sub Stripe
  conservée en `cancel_at_period_end` (rollback) jusqu'à N cycles réconciliés.
- **PCI** : aucune route n'accepte de PAN (revue d'invariant).
- **Mesurer le taux de récupération dunning** dès la V1 (décide de l'investissement V2).

## 5. Séquencement

```
Prérequis infra jobs/outbox ─▶ OPE-308 (SetupIntent/mandat) ─▶ OPE-309 (cycles+charge)
        │                                                          │
        └─▶ Facture PA + avoirs/crédits (réutilise factures) ──────┤
                                                                   ▼
                                            OPE-310 (dunning) + OPE-313 (réconciliation)
                                                                   ▼
                                            OPE-306/312 (migration cohorte pilote → vagues)
                                            OPE-311 (modes) : seulement ce que Stripe ne fait pas
```

## 6. Décision

> **Adopter l'hybride. Lancer la V1 ciblée (facture PA conforme + avoirs/crédits + off-session +
> dunning minimal), derrière feature flag par artisan, sur cohorte pilote réconciliée.**
> Différer proration fine, metered/paliers et parité Smart Retries. Réévaluer la V2 sur la base
> des métriques de récupération et de la demande réelle des modes de facturation.

Cette décision débloque OPE-308/309/310/311/312/313 (actuellement *blockedBy* OPE-307).
