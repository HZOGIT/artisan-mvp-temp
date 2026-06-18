# OPE-304 — Spike : modèle d'un moteur de billing maison

> Objectif : concevoir **modèle de données + domaine** d'un moteur de facturation maison, pour
> estimer l'effort réel. Vérité du build : **le coût n'est pas le prélèvement** (cf. OPE-303,
> trivial) **mais la proration, les crédits et le dunning**. Honnêteté sur ce que Stripe fait
> « gratuitement » qu'on devra recoder.

## 0. Principes directeurs (issus des audits)

- **Réutiliser, pas réinventer** : le module `factures` existe déjà
  (`src/modules/factures/`) avec `typeDocument` (`facture|avoir`), `factureOrigineId`,
  numérotation, et la trajectoire Factur-X/PA (EPIC OPE-227). La **facture SaaS** d'Operioz à
  l'artisan doit être un document de ce moteur — pas un schéma parallèle.
- **Stripe reste PSP** : on ne stocke aucun PAN ; on garde `stripe_customer_id` /
  `payment_method` tokenisé (cf. OPE-302 PCI SAQ-A).
- **Exactitude monétaire** : **centimes entiers (`integer`)** partout dans le moteur. On
  n'utilise PAS `numeric`+`parseFloat` (source d'erreurs d'arrondi ; cf. `stripe-adapter.ts:78`).
- **Idempotence** : génération de cycle et prélèvement idempotents (clé métier stable).
- **Clean-archi** : nouveau module `src/modules/billing/` (domaine pur + ports + repo Drizzle),
  gabarit des modules existants (`subscription`, `factures`).

## 1. Découpage `src/modules/billing/`

```
domain/        catalogue (plan/prix), souscription, cycle, proration (PURE), crédits
application/   use-cases : souscrire, changer-de-plan (proration), générer-cycle,
               prélever (off-session via StripePort), appliquer-crédit, émettre-avoir
infra/         repos Drizzle (scopés artisan), adapter StripePort étendu (OPE-303)
interface/     routeur tRPC (souscription/portail maison) + handlers webhook PI
```

## 2. Briques & complexité (ce que Stripe nous donne gratuitement)

| Brique | Ce que Stripe fait gratis | Effort maison | Difficulté |
|---|---|---|---|
| Catalogue plans/prix | Prices/Products, versions | table + lecture | Faible |
| Souscription + statut | machine à états complète | table + transitions | Faible-moyen |
| **Proration** upgrade/downgrade | calcul auto au prorata | **à recoder (PURE, testé)** | **Élevée** |
| Génération de cycle | invoicing automatique | scheduler + idempotence | Moyenne (dépend infra jobs) |
| **Crédits / avoirs / solde reportable** | customer balance + credit notes | **à recoder** | **Élevée** |
| Usage / metered | meters + agrégation | ingestion + agrégat/période | Moyenne |
| Facture conforme (PA) | ❌ Stripe non conforme FR | réutilise `factures` | Moyenne |
| Prélèvement off-session | — | OPE-303 (trivial) | Faible |
| Dunning | **Smart Retries** | OPE-305 | Élevée |
| Observabilité / réconciliation | dashboards Stripe | OPE-313 | Moyenne |

> **Les 3 vrais coûts** : proration, crédits/soldes, dunning. Ce sont des **domaines purs
> testables** — c'est exactement là qu'il faut investir en tests (invariants monétaires).

## 3. Schéma de données proposé (Drizzle, centimes entiers)

```ts
// src/modules/billing/ — esquisse (montants en centimes: integer)

// Catalogue (versionné : ne jamais muter un prix utilisé)
billing_plans       { id, code, name, active }
billing_prices      { id, planId, interval('month'|'year'), unitAmountCents:int,
                      currency('eur'), kind('flat'|'tiered'|'metered'), tiersJson, version,
                      activeFrom, activeTo }

// Mandat de paiement (cf. OPE-302 §2)
payment_mandates    { id, artisanId UNIQUE, stripeCustomerId, stripePaymentMethodId,
                      status('active'|'revoked'), consentAt, consentIp, cguVersion, revokedAt }

// Souscription maison (remplace progressivement subscriptions)
billing_subscriptions { id, artisanId UNIQUE, planId, priceId, status, quantity:int,
                        cycleAnchor:date, currentPeriodStart, currentPeriodEnd,
                        cancelAtPeriodEnd:bool, createdAt, updatedAt }

// Lignes à facturer accumulées sur la période (proration, usage, add-ons, one-shots)
billing_pending_items { id, subscriptionId, kind('base'|'proration'|'usage'|'addon'|'oneoff'|'credit'),
                        descr, amountCents:int(signé), periodStart, periodEnd, createdAt }

// Solde / crédits reportables (avoir non encore imputé)
billing_credits     { id, artisanId, amountCents:int, reason, sourceAvoirFactureId,
                      consumedCents:int, status('open'|'consumed'), createdAt }

// Compteurs d'usage (si metered un jour)
billing_usage_events { id, subscriptionId, meter, quantity:int, occurredAt, periodKey }

// Tentatives de prélèvement (idempotence + dunning OPE-305)
billing_charge_attempts { id, invoiceFactureId, attemptNo:int, idempotencyKey UNIQUE,
                          stripePaymentIntentId, status('pending'|'succeeded'|'failed'|'requires_action'),
                          failureCode, scheduledAt, executedAt }
```

**Articulation avec `factures`** : à la clôture de cycle, les `billing_pending_items` d'une
période sont **matérialisés en une facture** du module `factures` (`typeDocument='facture'`,
mentions + TVA + numérotation + Factur-X via PA). Un remboursement = `typeDocument='avoir'`
(+ `factureOrigineId`) qui alimente `billing_credits`. **Aucun moteur de facture parallèle.**

## 4. Domaine pur — les fonctions à tester en priorité

```ts
// proration.ts (PURE) — le cœur sensible
computeProration(oldPrice, newPrice, periodStart, periodEnd, changeAt): { creditCents, chargeCents }
// règle: remboursement au prorata du temps restant sur l'ancien + débit prorata du nouveau,
// arrondi en centimes, somme conservée (pas de centime perdu/créé).

// cycle.ts (PURE)
nextPeriod(anchor, interval, from): { start, end }   // gère fins de mois (31→28/30), bissextiles
collectItems(subscription, usage, credits): PendingItem[]  // base + usage + add-ons - crédits

// credits.ts (PURE)
applyCredits(amountDueCents, openCredits): { netDueCents, consumed[] }  // imputation FIFO
```

**Invariants à verrouiller (tests)** : Σ(prorata crédit+débit) cohérente ; jamais de montant
négatif facturé (→ avoir/crédit) ; idempotence (regénérer un cycle déjà émis = no-op) ;
centimes (aucune dérive float) ; FIFO crédits déterministe.

## 5. Estimation d'effort (dev, ordre de grandeur)

| Lot | Issue | Effort |
|---|---|---|
| Infra jobs/scheduler/outbox (**n'existe pas**, cf. §6) | (prérequis) | ~1 sem |
| SetupIntent + mandat | OPE-308 | ~1–1,5 sem |
| Moteur cycles + scheduler + proration | OPE-309 | ~3–4 sem |
| Dunning maison | OPE-310 | ~2 sem |
| Crédits/avoirs + intégration `factures`/PA | (OPE-311 / PA) | ~2 sem |
| Modes (usage/hybride/paliers/à la carte) | OPE-311 | variable (paliers ≈ config) |
| Migration des abonnements existants | OPE-312 | ~1,5 sem |
| Observabilité + réconciliation | OPE-313 | ~1,5 sem |
| **Total V-complète (hors PA)** | | **~12–15 sem** |

> **V1 réaliste (cf. décision OPE-307)** : mandat + facture SaaS PA-conforme + crédits/avoirs +
> off-session, **sans** metered/proration avancée (≈ **5–6 sem** + infra jobs). Le reste en V2.

## 6. Dépendance d'infra critique

**Le new-stack n'a aujourd'hui aucune infra de jobs/cron/outbox** (vérifié : aucun
scheduler/cron/queue dans `src/`). Le moteur de cycles **exige** un scheduler fiable
(prélèvements échus, retries dunning) + un **outbox** (effets Stripe exactly-once). À
**mutualiser** avec le besoin identique du projet PA (transmission PPF/PDP). C'est un
**prérequis transverse** à chiffrer avant tout build billing.

## 7. Conclusion (entrée OPE-307)

- Le modèle est **clair et borné** ; il **réutilise** `factures` (pas de doublon) et garde
  Stripe en PSP.
- Le **vrai coût** = proration + crédits + dunning (domaines purs, testables) + **l'infra de
  jobs manquante**.
- **Recommandation de cadrage** : viser une **V1 minimale à forte valeur** (facture conforme +
  crédits/avoirs + off-session) et **différer** proration fine / metered (peu de valeur BTP,
  cf. OPE-301). Ça réduit le risque (12–15 sem → 5–6 sem) tout en débloquant la valeur n°1.
