# Benchmark/vérif — TVA multi-taux : le calcul des totaux est **correct** (par ligne). Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Vérification de **correctness** (pas seulement de feature) : pour un devis/facture mêlant
> plusieurs taux (ex. 10 % rénovation + 20 % fournitures), les **montants stockés**
> (`totalTVA`/`totalTTC`) sont-ils justes ? ↔ Odoo `account` : taxe **par ligne**
> (`account.move.line.tax_ids`) puis **agrégation par taxe** (`tax_totals`).

---

## Conclusion : les totaux sont calculés **par ligne** → **corrects** en multi-taux. Pas de bug. Aucun ticket.

### ✅ Calcul par ligne (taux propre à chaque ligne)

- Montant TVA d'une ligne : `montantTVA = montantHT × (ligne.tauxTVA / 100)` — `server/routers.ts:838` (création), `:897` (lignes multiples), `:1575` (facture). Le **taux de la ligne** est utilisé (pas un taux global artisan).
- Recalcul des totaux du document : **somme des `montantTVA` par ligne** —
  `server/db.ts:556-566` (`for … totalTVA += parseFloat(ligne.montantTVA)`, `totalTTC = totalHT + totalTVA`) et `:765-770`. → un devis 10 %+20 % obtient un `totalTVA` **exact** (Σ des TVA de ligne), pas une TVA à taux unique appliquée au HT global.

### ✅ Cohérence aval (déclaration + FEC) : agrégation **par taux**

- CA3 / déclaration TVA : `SELECT tauxTVA, SUM(montantHT), SUM(montantTVA) … GROUP BY tauxTVA` (`db.ts:2669`).
- FEC (écritures de TVA collectée par taux) : `… SUM(montantTVA) … GROUP BY tauxTVA HAVING ABS(SUM(montantTVA)) > 0` (`db.ts:5582`).
→ La ventilation par taux est **préservée** jusqu'à la compta. Conforme à la logique Odoo `tax_totals`.

### Les seuls écarts du domaine TVA-ligne sont **déjà filés** (et ce ne sont pas des erreurs de calcul)

- **PDF** : le pied de facture affiche **un seul taux** (présentation), alors que le **stockage** est correct → **OPE-58** (Lancement).
- **Saisie** : l'article ne porte pas de **taux par défaut** → la ligne retombe à 20 % et l'utilisateur doit corriger → **OPE-167**. C'est un confort de **saisie**, pas un défaut de **calcul**.

---

## Verdict

Le **calcul des totaux TVA multi-taux** est **correct** (par ligne, agrégé par taux jusqu'au
FEC/CA3) — **pas de BLOCKER de montants** caché. Les écarts restants sont l'**affichage PDF**
(OPE-58) et le **pré-remplissage du taux** (OPE-167), tous deux filés et **distincts du calcul**.
**Aucun nouveau ticket benchmark.**

> Note méthodo : conformément à la recommandation du firing précédent (benchmark saturé), cette
> passe était une **vérification d'implémentation** d'un point à risque (justesse des montants
> légaux) plutôt qu'une chasse au gap — résultat **rassurant** (calcul conforme).
