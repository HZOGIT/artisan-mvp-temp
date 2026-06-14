# Benchmark/QA — Écritures de vente : ventilation TVA multi-taux **correcte** + avoir inversé. Sain. (1 micro-réserve → OPE-139.)

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness, écritures légales)

> `genererEcrituresFacture` (`server/db.ts:2756`) + `compteTvaCollectee` (`:5542`) ↔ Odoo
> `account.move` (TVA ventilée par `tax_line_id` → comptes de taxe distincts).

---

## ✅ Ventilation TVA par taux — correcte

`genererEcrituresFacture` ne lump pas la TVA : il **ventile par taux** depuis les lignes de
facture.
- Pour chaque ligne : `compteTvaCollectee(tauxTVA)` → compte par taux **445711** (20%) /
  **445712** (10%) / **445713** (5,5%) / **445714** (2,1%). Agrégation `montant` par compte.
- **Garde de cohérence** (`:2806`) : la ventilation par lignes n'est utilisée que si
  `|Σ montantTVA_lignes − totalTVA| < 0,02` (tolérance d'arrondi) ; **sinon repli** sur une
  seule écriture TVA (defensive). → pas d'écriture déséquilibrée.
- **Équilibre** : `411 (TTC)` = `706 (HT)` + `Σ 445.. (TVA par taux)`. Comme `totalTTC = totalHT
  + totalTVA` et `Σ TVA_taux = totalTVA` (garanti par la garde 0,02), l'écriture **balance**. ✅
- **Avoir** (OPE-136) : sens 411/706/445 **inversés**, **valeurs absolues** (jamais de négatif),
  cohérent avec le FEC. ✅

## ✅ `compteTvaCollectee` — couvre les 4 taux FR

Mapping par **seuils** (`taux >= 19.5 / 9.5 / 5 / 2`) → robuste aux variations (20.0, 10.0, 5.5,
2.1). Les lignes à **0 %** (franchise/exonéré) ont `montantTVA = 0` → **skippées** (`m <= 0
continue`), donc jamais routées vers un mauvais compte. Le repli final (`< 2 → 445711`) est
**inatteignable** pour un taux légitime. ✅ (Même fonction utilisée par le **FEC** `:5672` →
cohérence écritures stockées ↔ export FEC.)

## 🟡 Micro-réserve (rattachée OPE-139) : `445714` émis mais pas seedé

`compteTvaCollectee` **peut** émettre `445714` (TVA 2,1%), mais `initPlanComptable` (`:2856+`)
ne seed que `445710/711/712/713` — **pas** `445714`. Même classe qu'**OPE-139** (plan comptable
désaligné des comptes réellement émis). **Impact négligeable** : le taux **2,1 %** (presse,
certains médicaments, redevance TV) n'est **jamais** utilisé par un artisan du bâtiment. À
inclure simplement dans le fix de seed d'OPE-139 (commenté là-bas). **Pas de nouveau ticket.**

---

## Verdict

Le moteur d'**écritures de vente** ventile la **TVA multi-taux correctement** (comptes par taux,
écriture équilibrée, avoir inversé, garde anti-déséquilibre) et `compteTvaCollectee` couvre les
taux FR réels. Seule micro-réserve : `445714` (2,1 %, inusité) à ajouter au seed du plan
(**OPE-139**). **Aucun nouveau ticket.**
