# Benchmark/QA — Notes de frais : le total à rembourser IGNORE le flag `remboursable` → sur-remboursement. Ticket benchmark.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness)

> Chaîne de remboursement des notes de frais (`calculerTotalNoteFrais`, `payerNoteFrais`,
> `addDepenseToNoteFrais`) ↔ Odoo `hr.expense` (`payment_mode` own_account vs company_account).

---

## Constat

`calculerTotalNoteFrais` (`server/db.ts:6592`) — le **montant à rembourser** d'une note :
```sql
SELECT COALESCE(SUM(d.montant_ttc), 0) AS total
  FROM depenses d INNER JOIN notes_frais_depenses nfd ON nfd.depense_id = d.id
 WHERE nfd.note_id = ? AND d.artisan_id = ?
```
**Aucun filtre `d.remboursable = TRUE`.** Or :
- `addDepenseToNoteFrais` (`:6568`) **n'impose pas** `remboursable` non plus : il lie **n'importe
  quelle** dépense de l'artisan à une note (vérifie l'ownership, pas le flag).
- `payerNoteFrais` (`:6665`) marque **toutes** les dépenses liées `rembourse = TRUE` /
  `remboursee` — **sans** filtre `remboursable`.

→ Une dépense marquée **`remboursable = FALSE`** (ex. payée directement par l'entreprise) **liée**
à une note de frais est **comptée dans le total** et **marquée remboursée** au paiement →
**sur-remboursement** du salarié.

**Incohérence interne** : la **même base** filtre **correctement** ailleurs —
`db.ts:6368` (stats dépenses) : `SUM(CASE WHEN remboursable = TRUE AND rembourse = FALSE THEN
montant_ttc ELSE 0 END)`. Le filtre `remboursable` a donc été **oublié** dans la chaîne note.

> NB : la base du calcul est par ailleurs **correcte** — somme du **TTC** (le salarié a déboursé
> le TTC, remboursé en TTC ; la TVA déductible se récupère séparément) et **scopée `artisan_id`**.
> Le seul défaut est l'absence du filtre `remboursable`.

## Odoo 19

`hr.expense.payment_mode` ∈ `{own_account, company_account}` : seules les dépenses
**`own_account`** (avancées par le salarié) entrent dans le **montant à rembourser** de la
`hr.expense.sheet` ; les `company_account` (réglées par l'entreprise) **ne sont pas** remboursées
au salarié. Le flag `remboursable` d'Operioz en est l'équivalent — mais il n'est **pas** appliqué
au total/au paiement.

## Amélioration proposée (additif, non destructif)

1. **Filtrer `d.remboursable = TRUE`** dans `calculerTotalNoteFrais` (et dans le `SET … remboursee`
   de `payerNoteFrais`) — aligné sur la stat `:6368`.
2. (Mieux) **refuser** dans `addDepenseToNoteFrais` la liaison d'une dépense `remboursable = FALSE`
   à une note (ou avertir) — une note de frais ne contient que des avances salarié.

## Bénéfice

Empêche le **sur-remboursement** (montant payé au salarié > avances réelles) et aligne la note de
frais sur la sémantique `remboursable` déjà respectée par les stats. Coût faible (1 clause `WHERE`).

## Effort estimé

**S** — ajout d'un filtre `remboursable` (2 requêtes) + (option) garde à la liaison. Pas de migration.

## Priorité MVP

**Moyenne** — déclenché par un cas-bord (dépense non remboursable liée à une note), mais **impact
financier** (sur-paiement) et incohérence avec le reste du module. Concerne surtout les **comptes
multi-utilisateurs** (vrais workflows de notes de frais).

> Distinct d'OPE-63 (séparation des tâches : auto-approbation/paiement), OPE-99 (doublon
> justificatif), OPE-163 (compte d'écriture 401), OPE-98/169 (indemnités km). Ici = **le total à
> rembourser ignore `remboursable`**.
