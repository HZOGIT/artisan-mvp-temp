# Benchmark/QA — Paiement partiel : le bug `markAsPaid` (OPE-60) **fausse aussi l'écriture d'encaissement/FEC**, pas que le dashboard. Enrichi OPE-60. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness)

> Domaine : Paiements / encaissement (`factures` ↔ Odoo `account.payment` + `account.move.payment_state`).
> Cible QA : correctness du **paiement partiel** (cas acompte, très courant en bâtiment).

---

## Vérification

`factures.markAsPaid` (`server/routers.ts:1598`) force `statut: "payee"` (`:1616`) sans comparer
`montantPaye` au `totalTTC` et **écrase** `montantPaye` (`:1614`). Le front (`FactureDetail.tsx:521`)
laisse saisir un **montant libre** (prérempli au TTC mais éditable). L'enum MySQL `factures.statut`
(`drizzle/schema.ts`) **n'a pas** `partiellement_payee` (présent seulement côté Zod/PDF).

→ Un acompte (300 € / 1 000 €) marque la facture **entièrement payée**. **Déjà filé en
[OPE-60](https://linear.app/operioz/issue/OPE-60)** (HIGH, projet « Lancement 30 juin », audit
`2026-06-07-paiement-partiel-markaspaid.md`) + modèle de règlements
[OPE-116](https://linear.app/operioz/issue/OPE-116). **Pas de doublon créé.**

## Apport de cette passe QA (volet compta absent d'OPE-60) → commenté sur OPE-60

OPE-60 décrit l'impact **dashboard/CA** mais pas l'**écriture comptable**. Or `markAsPaid` appelle
`genererEcrituresEncaissement` (`server/db.ts:2786`), gardée sur `statut === 'payee'` (`:2798`), qui
écrit au **journal BANQUE** : `512 débit = totalTTC` (`:2808`) / `411 crédit = totalTTC` (`:2809`),
**lettrage `VL{id}`** soldant le 411 de la vente. Elle utilise le **TTC**, **jamais `montantPaye`**.

**Conséquence** : un acompte marqué `payee` fait apparaître dans la **Balance / Grand Livre / FEC**
un encaissement de **1 000 €** et une **créance 411 soldée**, alors que 700 € restent dus. Le défaut
**dépasse l'affichage** : il **fausse les écritures et l'export FEC** (vérité légale). Le fix d'OPE-60
(statut + garde + dashboard) doit donc **aussi** corriger l'écriture d'encaissement (book le montant
réellement réglé / lettrage partiel), idéalement via la **table `reglements`** d'OPE-116 (une écriture
BQ par règlement daté). Coordination OPE-60 × OPE-116 recommandée.

## Odoo 19 (référence)

`account.payment` = un enregistrement **par règlement** (`amount`, `payment_type`, `is_reconciled`) ;
`account.move.payment_state` (`not_paid`/`partial`/`in_payment`/`paid`) et `amount_residual` sont
**dérivés des règlements rapprochés**, pas saisis. Chaque règlement génère son écriture de banque à
son montant. C'est exactement la cible d'OPE-116 (règlements) + OPE-60 (statut/garde).

---

## Verdict

Le paiement **partiel** est un **vrai défaut de correctness** (créance perdue de vue **+ écritures
BQ/FEC surévaluées**), **déjà filé** (OPE-60 HIGH + OPE-116). Cette passe a **confirmé** le bug sur le
code courant et **enrichi OPE-60** du volet comptable manquant (écriture d'encaissement au TTC).
**Aucun nouveau ticket.** La série QA-écritures (vente + encaissement **plein**) reste juste ; seul le
**cas partiel** diverge, et il est couvert.
