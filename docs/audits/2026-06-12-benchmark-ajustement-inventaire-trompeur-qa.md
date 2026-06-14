# Benchmark/QA — Stock : le calcul d'`adjustStock` est juste, MAIS « Ajustement (inventaire) » est trompeur (additif + min=0). Enrichi OPE-129. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness)

> Re-revue de `adjustStock` (`server/db.ts:1032`) **avec son UI** (`client/src/pages/Stocks.tsx`)
> ↔ Odoo `stock.quant.inventory_quantity` (comptage qui **fixe** la valeur).

---

## Précision sur la passe QA antérieure

`docs/audits/2026-06-12-benchmark-adjuststock-calcul-ok-atomicite-ope104.md` concluait
« Ajustement → `currentQty + quantity` (delta). Cohérent. » — **vrai au niveau calcul pur**,
mais cette passe **ne regardait pas l'UI**. En la regardant, le contrôle est **trompeur pour
son objectif affiché** :

- **Backend** (`db.ts:1038`) : `ajustement` = `currentQty + quantity` → **identique à `entree`**
  (delta additif), **pas** un « set à la quantité comptée ».
- **Front** (`Stocks.tsx:669/679`) : option libellée **« Ajustement (inventaire) »** + champ
  Quantité **`min="0"`**.

→ Conséquences :
1. **Pas de correction à la baisse** possible via « ajustement » (`min=0` + addition) — un écart
   négatif (compté 8 / système 10) n'est **pas saisissable** ici.
2. **Double comptage** : saisir la quantité **comptée** (réflexe vu le libellé « inventaire »)
   **ajoute** au lieu de **fixer** → stock **gonflé**.
3. « Ajustement » est donc **fonctionnellement un doublon d'« entrée »** et inutilisable comme
   inventaire.

## Statut

C'est précisément le manque d'**OPE-129** (inventaire physique : comptage → `quantiteReelle`
qui **fixe** + écart). **Enrichi sur OPE-129** avec un **quick win** indépendant de la feature
complète (renommer l'option « Correction (+) », **ou** faire `ajustement` = SET absolu +
autoriser le négatif). **Pas de nouveau ticket** (anti-doublon ; éviter le sur-ticketing — même
logique que l'atomicité rattachée à OPE-104).

## Autres réserves (déjà couvertes)

- **Stock négatif** sur `sortie` : autorisé (backorder, comme Odoo selon config) — non bloquant.
- **Atomicité** (read-modify-write) : latente, **rattachée à OPE-104** (où la concurrence arrive).

---

## Verdict

Le **calcul** du mouvement est juste, mais l'**« Ajustement (inventaire) »** est **mal nommé et
bridé** (additif, `min=0`) → trompeur et incapable de corriger à la baisse. **Enrichi OPE-129**
(quick win + cible). **Aucun nouveau ticket.**
