# QA — `adjustStock` : calcul **correct**, atomicité à garantir avec OPE-104. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (passe de QA correctness)

> Revue de `adjustStock` (`server/db.ts:1007`) ↔ Odoo `stock.quant`
> (`_update_available_quantity`). Vérifier que le mouvement de stock est juste.

---

## ✅ Le calcul du mouvement est correct

- **Entrée** → `currentQty + quantity` ; **Sortie** → `currentQty - quantity` ; **Ajustement**
  → `currentQty + quantity` (delta). Cohérent.
- `mouvements_stock` enregistre `quantiteAvant` (= currentQty) et `quantiteApres` (= newQty) →
  **traçabilité** correcte du mouvement.
- Stock **négatif** possible (sortie > stock) = **état connu** (backorder), non bloquant —
  Odoo l'autorise aussi selon config. Le « comptage physique → valeur cible » est **OPE-129**.

## ⚠️ Seul axe : **atomicité** sous concurrence — rattaché à OPE-104

`adjustStock` est un **read-modify-write** (lit `currentQty`, calcule, écrit `newQty`). Deux
appels **concurrents** sur le **même article** ⇒ **lost update** (stock faux) + `quantiteAvant/Apres`
incohérents.

- **Sans impact aujourd'hui** : le seul déclencheur est l'**ajustement manuel** (1 utilisateur,
  séquentiel). La concurrence n'existe pas encore.
- **Devient réel avec OPE-104** (décrément auto à la facturation/intervention, déclenchable par
  **plusieurs techniciens en parallèle** via le mobile). → **Exigence d'implémentation commentée
  sur OPE-104** : faire le mouvement via un **UPDATE atomique relatif**
  (`SET quantiteEnStock = quantiteEnStock - ? WHERE id=? AND artisanId=?`) **dans une transaction**
  (OPE-84) avec l'`INSERT mouvements_stock`. Pattern Odoo (`_update_available_quantity`, `FOR UPDATE`).

→ **Pas de ticket séparé** (anti-over-ticketing) : le défaut ne se matérialise qu'**avec** la
feature OPE-104, donc l'exigence y est placée.

---

## Verdict

`adjustStock` calcule **juste** ; le stock négatif/comptage-physique sont déjà couverts
(OPE-129). Le seul risque (**lost update** non atomique) est **latent** et **rattaché à OPE-104**
(où la concurrence sera introduite). **Aucun nouveau ticket benchmark.**

> Suite de la série QA-correctness : après les montants légaux (TVA/FEC/CA3, OK), la conversion
> devis→facture (BLOCKER OPE-176 corrigé), le sweep reselect (1 bug biblio corrigé), et ici le
> mouvement de stock (calcul OK, atomicité tracée sur OPE-104).
