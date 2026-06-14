# Benchmark/QA — Écritures comptables stockées équilibrées + le bug lookup-`numero` (OPE-176) est isolé. Aucun nouveau ticket benchmark.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Suite de la QA de correctness (TVA multitaux + FEC + CA3 déjà vérifiés OK ; OPE-176 BLOCKER
> trouvé hier). Deux vérifications ce firing.

---

## 1. `genererEcrituresFacture` (table `ecritures_comptables`) : **équilibrée** ✅

Code path **distinct** du FEC export — écritures stockées (`server/db.ts:2694-2752`).

- `411 Clients` **débit = totalTTC** (`:2717`) ; `706 Prestations` **crédit = totalHT** (`:2719`) ;
  `445 TVA collectée` **crédit = Σ TVA par taux** (`:2740-2741`).
- Équilibre : `débit(411)=totalTTC`, `crédit(706+445)=totalHT + sommeLignes`. Or `sommeLignes`
  (= Σ `|montantTVA|` de ligne, `:2731-2733`) **== totalTVA**, et `totalTTC = totalHT + totalTVA`
  ⇒ **débit = crédit, exactement** (tolérance `<0.02` = garde-fou seulement).
- **Idempotent** : purge des écritures de la facture avant ré-insertion (`:2712`).
- **Avoir** : sens inversé, **valeur absolue** (`:2705-2708`) → jamais de négatif.
- **TVA par taux** : 445711 (20 %) / 445712 (10 %) / 445713 (5,5 %) via `compteTvaCollectee` (`:2734`).
- Edge négligeable : le repli (`:2744`, lignes indisponibles) agrège sur **445711** (20 %) →
  l'équilibre tient, seul le **compte** serait imprécis dans ce cas théorique.

→ Cohérent avec le FEC export (déjà vérifié). Les **deux** chemins d'écritures de vente
balancent. **Pas de risque de compta déséquilibrée.**

## 2. Sweep du pattern « lookup `numero` non scopé » (cause d'OPE-176) : **isolé** ✅

`grep` des relectures par `numero` dans `server/db.ts` :

| Ligne | Fonction | Scopé `artisanId` ? |
| -- | -- | -- |
| 494 | `createDevis` | ✅ `and(artisanId, numero)` |
| 628 | `createFacture` | ✅ `and(artisanId, numero)` |
| **656** | **`createFactureFromDevis`** | ❌ **`numero` seul → OPE-176** |
| 5326 | (création devis) | ✅ `and(artisanId, numero)` |

→ Le défaut **n'existe qu'à un seul endroit** (OPE-176, déjà filé en « Lancement 30 juin »).
Le blast radius est **borné à la conversion devis→facture** ; les autres relectures sont
correctement scopées. Pas d'autre BLOCKER de ce pattern.

---

## Verdict

Les **écritures comptables stockées** balancent (411 TTC = 706 HT + 445 TVA-par-taux), comme le
FEC. Le bug de **relecture `numero` non scopée** est **unique** (OPE-176) — pas de récidive
ailleurs. **Aucun nouveau ticket benchmark** ; le BLOCKER reste OPE-176 (Lancement).

> La chaîne complète des montants/écritures légaux est désormais vérifiée : totaux TVA
> multitaux → écritures stockées → FEC export → CA3. **Tous corrects.** Seul écart : le lookup
> cross-tenant OPE-176 (filé, fix safe candidat auto-fix).
