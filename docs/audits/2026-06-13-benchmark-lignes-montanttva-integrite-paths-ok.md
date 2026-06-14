# Benchmark/QA — Intégrité de `montantTVA` sur toutes les voies de création de lignes facture/devis ✅ OK

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness) · **Domaine** : Devis/Factures — cohérence des lignes (`factures_lignes`/`devis_lignes` ↔ Odoo `account.move.line`)

> Suite directe de la finding <issue href="https://linear.app/operioz/issue/OPE-250">OPE-250</issue> (la ligne de facture **de contrat** était créée sans `montantTVA` → ventilation FEC erronée pour les taux réduits). Sweep de **toutes** les voies de création/copie de ligne pour vérifier que `montantTVA` est systématiquement renseigné — car la ventilation TVA du FEC (`genererEcrituresFacture`) somme `factures_lignes.montantTVA` par taux. Une ligne à `montantTVA = 0` mal-ventile la TVA.

---

## ✅ Toutes les voies renseignent `montantTVA`

| Voie | Réf. | `montantTVA` ? |
|---|---|---|
| `factures.addLigne` | `routers.ts:1716-1730` | ✓ `(montantHT * taux/100).toFixed(2)` |
| `devis.addLigne` | `routers.ts:934-948` | ✓ calculé |
| Devis import / lignes en masse | `routers.ts:993-999` | ✓ calculé |
| Duplication devis (copie de ligne) | `routers.ts:1191-1202` | ✓ `montantTVA: ligne.montantTVA` |
| `createAvoir` (lignes négatives) | `routers.ts:2093-2105` | ✓ `(montantHT * taux/100)`, signe négatif cohérent |
| **`createFactureFromDevis`** (conversion devis→facture, **voie principale**) | `db.ts` (`for (ligne of lignesDevis)` → `montantTVA: ligne.montantTVA`) | ✓ **recopie** le `montantTVA` des lignes du devis |
| **`contrats.generateFacture`** | `routers.ts:5243` | ✅ **corrigé** par <issue href="https://linear.app/operioz/issue/OPE-250">OPE-250</issue> (commit `b586ead`) — était la **seule** voie défaillante |

→ Les lignes de devis portent toujours un `montantTVA` cohérent (`devis.addLigne`), donc la **conversion** `createFactureFromDevis` (qui le **recopie**) produit des lignes de facture cohérentes. La voie de **facturation directe** (`addLigne`) et l'**avoir** sont également corrects. La cohérence `montantHT + montantTVA = montantTTC` par ligne est ainsi garantie sur **toutes** les voies.

## Conséquence — ventilation TVA du FEC fiable

`genererEcrituresFacture` ventile la TVA collectée par taux (445711/445712/445713) en sommant `factures_lignes.montantTVA`, avec garde `|Σ lignes − totalTVA| < 0,02` (repli sinon sur 445711). Avec `montantTVA` désormais renseigné sur **toutes** les lignes (contrat inclus), le garde **passe** systématiquement → TVA ventilée au **bon compte** quel que soit le taux (20 %/10 %/5,5 %), pour factures directes **et** issues de contrat **et** issues de devis.

## Odoo 19

`account.move.line` impose des montants de taxe **cohérents par ligne** (recalcul à `create`/`onchange`, `price_subtotal`/`price_total` + `tax_ids`) ; la ventilation comptable dérive de ces lignes, jamais d'un total déconnecté. Operioz atteint désormais la même invariant sur ses 6 voies de création de ligne.

## Verdict

L'invariant **`montantTVA` renseigné et cohérent par ligne** est respecté sur **toutes** les voies de création/copie de ligne (facture directe, devis, import, duplication, avoir, conversion devis→facture, facture de contrat). La **seule** voie défaillante (contrat) a été corrigée par <issue href="https://linear.app/operioz/issue/OPE-250">OPE-250</issue>. → Ventilation TVA du FEC **fiable** sur tous les chemins. **Aucun nouveau ticket** (aucune voie restante en défaut, pas de doublon).
