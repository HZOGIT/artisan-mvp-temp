# Benchmark/QA — Numérotation & totaux des documents (devis/factures/avoirs/commandes) : numérotation déjà filée (OPE-34), **totaux corrects**. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness)

> Vérification de correctness de deux points à risque : (1) la **numérotation séquentielle**
> des documents (exigence légale FR) ; (2) la **cohérence des totaux** document ↔ lignes le
> long de la chaîne devis → facture. Réf. Odoo : `account.move` (`name` séquentiel au post),
> `sale.order`/`account.move` (`amount_total` dérivé des lignes).

---

## 1. Numérotation séquentielle — déjà filée, rien à ajouter

`getNextFactureNumber` (`server/db.ts:603`), `getNextDevisNumber` (`:468`),
`getNextAvoirNumber` (`:710`) : allocation **lecture-puis-écriture non atomique**
(`MAX(numero)` + compteur param, `Math.max`, update) **sans transaction ni verrou**, et
`factures.numero`/`devis.numero` **sans contrainte UNIQUE**.

Les **deux** défauts légaux (CGI 242 nonies A : séquence continue, sans trou, unique) sont
**déjà documentés** dans `docs/audits/2026-06-06-numerotation-factures.md` et filés :
- **BLOCKER** : course → numéros dupliqués (filet `fixDuplicateNumbers` prouve que c'est
  observé ; réécrire un n° émis serait illégal). Fix = allocation atomique + `UNIQUE(artisanId, numero)`.
- **HIGH** : numéro alloué dès le **brouillon** → **trou de séquence** à la suppression du
  brouillon ; correctif attendu = allouer le n° définitif **à la validation** (comme Odoo
  `_post`). → **OPE-34** (numérotation, non éligible auto-fix).

**Avoir** : série **distincte** (`prefixeAvoir`/`compteurAvoir`, `MAX` scopé
`typeDocument='avoir'`) → correct (série d'avoirs séparée admise). Réserve mineure : le `MAX`
de `getNextFactureNumber` n'est **pas** filtré par `typeDocument` et s'appuie sur l'ordre
alphabétique des préfixes (`FAC` > `AV`) ; sûr avec les préfixes par défaut, fragile seulement
si un artisan configurait un préfixe d'avoir alphabétiquement **supérieur** au préfixe de
facture (cas très improbable). Rattaché à la même racine OPE-34. **Pas de nouveau ticket.**

## 2. Cohérence des totaux document ↔ lignes — **correcte**

### ✅ Devis / Factures (documents fiscaux)

- Par **ligne** (`addLigne`/`updateLigne`, `routers.ts:838-857`) : `montantHT = q×PU`,
  `montantTVA = montantHT×taux/100`, chacun **arrondi à 2 décimales** (`toFixed(2)`) au stockage.
- `recalculateDevisTotals` (`db.ts:558`) / `recalculateFactureTotals` (`db.ts:773`) somment les
  **montants de ligne déjà arrondis** → `totalHT = Σ montantHT`, `totalTVA = Σ montantTVA`,
  `totalTTC = totalHT + totalTVA`. C'est l'approche **round-per-line-then-sum** (conforme
  FR/Odoo, déjà validée en `2026-06-06-calcul-montants-tva-ok.md` et
  `2026-06-12-benchmark-tva-multitaux-totaux-correct-ok.md`).
- **Recalcul systématique** : `recalculate*` est appelé après **chaque** mutation de ligne
  (add/update/delete : `routers.ts:860/914/933/1103/1600/1952`) → les totaux **ne dérivent
  jamais** des lignes.
- **Conversion devis → facture** (`createFactureFromDevis`, `db.ts:639`) : copie les lignes
  **et** les totaux du devis. Comme les totaux du devis sont maintenus en phase avec ses
  lignes, la facture produite est **cohérente** (totaux = Σ lignes copiées). ✅
  - Réserve théorique : la conversion **ne rappelle pas** `recalculateFactureTotals` après la
    copie ; elle fait confiance aux totaux du devis. C'est correct **tant que** tout chemin qui
    écrit des lignes de devis recalcule les totaux (vérifié pour les mutations standard). Un
    recalcul défensif post-copie serait une ceinture-et-bretelles bon marché, **non bloquant**.

### ✅ Commandes fournisseurs (document **non** fiscal)

`commandesFournisseurs.create` (`routers.ts:3673+`) : totaux calculés **sum-then-round**
(`Σ(q×PU×taux)` puis `toFixed(2)`), lignes avec `tauxTVA` (colonne présente
`schema.ts` `lignes_commandes_fournisseurs.tauxTVA`). Différence d'arrondi (sum-then-round vs
round-per-line du côté vente) **sans enjeu** : un bon de commande est un **engagement interne**,
pas un document fiscal à séquence/immuabilité. Observation mineure : le champ `montantTotal`
est **redondant** avec `totalTTC` au niveau en-tête, et `montantTotal` de **ligne** = HT (pas
TTC) — smell de modèle, pas un bug. **Pas de ticket.**

---

## Verdict

- **Numérotation** : défauts réels mais **déjà filés** (OPE-34 + audit dédié). Rien à ajouter.
- **Totaux des documents** : la chaîne par-ligne → recalcul → conversion est **cohérente et
  correcte** (round-per-line côté vente, totaux toujours en phase avec les lignes). Côté achats,
  acceptable (non fiscal).

**Aucun nouveau ticket** (anti-doublon). Le moteur de chiffres documentaire reste **sain** ;
le seul vrai chantier de correctness restant sur ce périmètre est l'**atomicité + l'allocation
à la validation** de la numérotation (OPE-34).
