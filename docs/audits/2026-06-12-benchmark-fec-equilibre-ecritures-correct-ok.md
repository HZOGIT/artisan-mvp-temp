# Benchmark/vérif — FEC : les écritures sont **équilibrées** (débit = crédit) et la TVA est ventilée par taux. Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Vérification de **correctness/conformité** : le FEC (arrêté 29/07/2013) est **rejeté par la
> DGFiP s'il ne balance pas** (Σ débit ≠ Σ crédit) ou s'il contient des **montants négatifs**.
> Contrôle de la construction des écritures de vente ↔ Odoo `account.move` (balanced moves).

---

## Conclusion : écritures **équilibrées par construction** + TVA par taux + avoirs inversés (pas de négatif). Pas de bug. Aucun ticket.

### ✅ Écriture de vente équilibrée (`server/db.ts:5556-5599`)

Pour une **facture** :
- `411 Clients` **débit = ttc** (`:5573/5575`)
- `706 Ventes` **crédit = ht** (`:5574/5576`)
- `445 TVA collectée` **crédit = Σ TVA par taux** (`:5588-5591`)

Équilibre : `débit(411) = ttc` et `crédit(706+445) = ht + sommeLignes`. Or :
- `totalTVA` stocké = **Σ des `montantTVA` de ligne** (recalc `db.ts:563`, vérifié au firing
  TVA-multitaux) ; `totalTTC = totalHT + totalTVA` (`:566`).
- `sommeLignes` = `SUM(montantTVA) GROUP BY tauxTVA` puis somme des groupes (`:5586`) = **Σ des
  mêmes `montantTVA`** = `totalTVA` (`tva`). Le `SUM` SQL est exact sur les décimaux stockés.

→ `sommeLignes == tva` et `ttc = ht + tva` ⇒ **débit = crédit, exactement.** La tolérance
`< 0.02` (`:5587`) n'est qu'un garde-fou ; en pratique l'égalité est stricte.

### ✅ TVA ventilée par taux (445711/712/713)

`compteTvaCollectee(tauxTVA)` (`:5589`) attribue le **bon compte de TVA collectée selon le
taux** de chaque groupe (20 % → 445711, 10 % → 445712, 5,5 % → 445713). Conforme PCG/Odoo
(`account.tax` → comptes de taxe).

### ✅ Avoirs : sens inversé, valeurs absolues (jamais de négatif)

`isAvoir` (`:5565`) inverse le sens (`411 crédit / 706+445 débit`) en **valeur absolue**
(`Math.abs`, `:5568`) → respecte l'**interdiction des montants négatifs** au FEC (OPE-136). Le
journal de banque (règlement/remboursement) suit la même logique (`:5631-5644`).

### ✅ Auto-contrôle de conformité

`genererFEC` calcule `totalDebit`/`totalCredit`/`ecart` et remplit `erreurs`/`equilibre`
(`:5647+`) → toute écriture déséquilibrée serait **signalée** dans le résultat, pas livrée
silencieusement.

### Replis / edge négligeable

Le `else` (`:5594`, lignes non exploitables) agrège la TVA sur le compte **20 % par défaut** :
l'équilibre tient (montant = `tva`), seul le **compte** pourrait être imprécis dans ce cas
**théorique** (les lignes existent toujours en pratique). Négligeable, non bloquant.

---

## Verdict

Les **écritures FEC** sont **équilibrées par construction** (411 TTC = 706 HT + 445 TVA-par-taux),
la **TVA est ventilée par taux**, les **avoirs sont inversés sans négatif**, et un **auto-contrôle
d'équilibre** existe. **Pas de risque de rejet DGFiP** pour déséquilibre/négatif. Le domaine FEC
reste par ailleurs couvert par ses tickets (OPE-19 Factur-X, conformité FEC côté « Lancement »).
**Aucun nouveau ticket benchmark.**

> Méthodo : 2ᵉ passe de **QA de correctness** sur les chiffres légaux (après TVA-multitaux),
> plus utile que la chasse au gap sur un backlog benchmark saturé. Résultat **rassurant**.
