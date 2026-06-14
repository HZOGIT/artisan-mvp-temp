# Benchmark/QA — Écriture d'encaissement (journal BANQUE) équilibrée + lettrée. Chaîne d'écritures complète. Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Dernière brique de la série QA-écritures : `genererEcrituresEncaissement` (`server/db.ts:2774`)
> — l'écriture de règlement d'une facture ↔ Odoo `account.payment` (512/411 + lettrage).

---

## Conclusion : l'écriture d'encaissement est **correcte**. Aucune issue.

### ✅ Équilibre + lettrage

Pour une facture **payée** (`statut === 'payee'`, `:2786`) :
- `512 Banque` **débit = ttc** (`:2796`) ; `411 Clients` **crédit = ttc** (`:2797`) → **débit = crédit** (équilibré).
- **Lettrage** : les deux lignes portent `lettrage = 'VL{factureId}'` (`:2793`), **même code que
  le 411 de l'écriture de vente** → réconciliation correcte du compte client (la créance 411 du
  journal VE est soldée par le 411 du journal BQ).
- **Date** = `datePaiement` (`:2788`) → l'encaissement est daté au **paiement**, pas à la facture. ✅
- **Idempotent** : purge des écritures BQ de la facture avant régénération (`:2781-2784`). ✅

→ Cohérent avec le journal de banque du **FEC export** (déjà vérifié). La chaîne d'écritures de
vente **et** d'encaissement **balance**.

### Observation mineure (non bloquante) : avoir remboursé en écritures **stockées**

`genererEcrituresEncaissement` fait un `return` anticipé si `ttc <= 0` (`:2790`) → un **avoir
remboursé** (TTC négatif) **n'a pas d'écriture BANQUE stockée** (512 crédit / 411 débit). **Mais**
le **FEC export** (`genererFEC`, `db.ts:5638`) gère **correctement** le décaissement d'avoir
(inversion en valeur absolue) → **l'export légal est juste** ; seule la vue **in-app** des
écritures stockées est incomplète pour ce cas-bord (remboursement d'avoir). **Faible enjeu**
(le FEC = la vérité légale), à garder en tête si la vue compta in-app doit être exhaustive.

---

## Verdict

L'**écriture d'encaissement** est **équilibrée, lettrée, idempotente, datée au paiement** —
correcte. **Aucun nouveau ticket.** La série QA-écritures est complète :
**vente** (stockée + FEC) + **encaissement** = **toutes balancent**.

> Bilan global de la série QA-correctness (montants/écritures légaux) : **tout est juste**
> (TVA multi-taux, FEC, CA3, écritures vente/encaissement, plafond avoir). Les défauts trouvés
> étaient **structurels** et traités : cross-tenant **OPE-176** (corrigé), orphelins de
> suppression **OPE-177** (cas stock corrigé, cas légaux ouverts), atomicité stock (OPE-104),
> bug reselect biblio (corrigé). Le moteur de chiffres de la compta est **sain**.
