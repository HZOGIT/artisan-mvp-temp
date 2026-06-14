# Benchmark/QA — Avoir (note de crédit) : correctness montants + propagation comptable ✅ OK (parité MVP)

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe correctness financière) · **Domaine** : Factures / avoirs (`factures.typeDocument='avoir'` ↔ Odoo `account.move` `move_type='out_refund'`)

> Vérification de **correctness** (pas une découverte de gap) du flux **avoir** : garde anti-sur-avoir (créditer plus que la facture), signe des montants, et **propagation** dans les agrégats légaux (FEC, CA, TVA collectée, encours client). Risques : note de crédit > facture d'origine → CA/TVA **négatifs** indus ; avoir non déduit → CA **surévalué**. ↔ Odoo : `_reverse_moves` + rapprochement (`reconcile`) + contrôle du résiduel.

---

## ✅ Garde anti-sur-avoir (over-crediting) — `routers.ts:2001-2072`

`createAvoir` empile **trois** contrôles avant d'émettre, tous tenant-scopés (`getFactureByIdSecure(factureOrigineId, artisan.id)`) :

1. **Refus sur brouillon** (`:2026`) : on ne crédite qu'une facture **émise** (`statut !== "brouillon"`).
2. **Anti-avoir-total-doublon** (`:2039-2047`) : si un avoir couvrant déjà **intégralement** la facture existe (`|Σ avoir| ≈ totalTTC`, tol. 0,01 €) → **FORBIDDEN**.
3. **Solde restant** (`:2049-2072`) : `soldeRestant = factureTotalTTC − Σ|avoirs existants|` ; si le **nouvel** avoir (recalculé indépendamment depuis ses lignes, `:2058-2066`) **dépasse** ce solde → **BAD_REQUEST**. → la somme des avoirs ne peut **jamais** excéder la facture d'origine (pas de crédit fantôme).

→ Équivaut au contrôle Odoo (un `out_refund` rapproché ne peut pas sur-rembourser une `out_invoice` ; le résiduel reste ≥ 0).

## ✅ Signe des montants — lignes négatives cohérentes (`:2092-2115`)

Chaque ligne d'avoir est stockée en **négatif** : `montantHT = −(|qté|·|PU|)`, `prixUnitaireHT = −|PU|`, `montantTVA = montantHT·taux/100`, `montantTTC = HT+TVA`, **TVA par ligne** (pas de taux global — pas le bug PDF <issue href="https://linear.app/operioz/issue/OPE-58">OPE-58</issue>). `recalculateFactureTotals(avoir.id)` (`:2115`) agrège ces négatifs → `totalTTC` de l'avoir **négatif**. ✓

## ✅ Propagation comptable — l'avoir contre-passe partout, avec le bon signe

| Agrégat | Site | Traitement avoir | Verdict |
|---|---|---|---|
| **Écritures** (ledger `ecritures_comptables`) | `genererEcrituresFacture` (`db.ts:3310-3360`) | `isAvoir = typeDocument==='avoir' \|\| totalTTC<0` → **débit/crédit inversés** (411/706/445711) | ✓ contre-passation |
| **FEC** (export légal, on-the-fly) | `db.ts:6378-6420` | `statut IN ('validee','envoyee','payee','en_retard')` **inclut** l'avoir (créé `validee`) ; `isAvoir` (`:6395`) inverse débit/crédit ; TVA ventilée par taux depuis les lignes | ✓ |
| **CA / TVA collectée** | `db.ts:6454-6470`, `:6518+` | même filtre statut + `isAvoir` (`:6468`) → l'avoir **soustrait** du CA et de la TVA collectée | ✓ |
| **Encours client** | `getEncoursClient` / `getEncoursByClient` (`db.ts:714-800`, <issue href="https://linear.app/operioz/issue/OPE-247">OPE-247</issue>) | avoir `validee` → `creditAvoirs += |totalTTC|`, déduit de l'encours (planché à 0) | ✓ |

→ Point clé de cohérence : l'avoir est créé **directement** `statut="validee"` (`:2083`), et **tous** les agrégats légaux incluent `validee` (ou « ≠ annulee/brouillon » pour l'encours) → l'avoir n'est **jamais** « bloqué » dans un statut non compté. Pas d'asymétrie « facture comptée mais avoir ignoré ».

## 🔗 Issues connexes (déjà tracées — pas de doublon)

- **Rendu PDF de l'avoir** — <issue href="https://linear.app/operioz/issue/OPE-165">OPE-165</issue> (HIGH, In Review) : titre « FACTURE » au lieu d'« Avoir », rappel de la facture d'origine. **Présentation**, pas correctness des montants. Hors périmètre de cette note.
- **Numérotation** — `getNextAvoirNumber` partage la classe <issue href="https://linear.app/operioz/issue/OPE-248">OPE-248</issue> (numéro attribué tôt) / <issue href="https://linear.app/operioz/issue/OPE-34">OPE-34</issue> (atomicité). Déjà filé. Note : l'avoir étant créé `validee` d'emblée (pas de brouillon), le risque de **trou** par suppression de brouillon ne le concerne pas.
- **Inaltérabilité des écritures** — <issue href="https://linear.app/operioz/issue/OPE-118">OPE-118</issue> (delete-then-insert dans `genererEcrituresFacture`). Orthogonal à la correctness de signe vérifiée ici.

## Odoo 19

`account.move` avoir = `move_type='out_refund'` créé via `_reverse_moves` (contre-passation automatique des lignes), rapproché (`reconcile`) avec la facture d'origine ; le résiduel rapproché empêche le sur-remboursement. Operioz atteint l'équivalent **fonctionnel MVP** : garde de solde explicite (au lieu du rapprochement comptable fin), lignes négatives, inversion débit/crédit dans le ledger + FEC + CA + encours. Le **rapprochement ligne-à-ligne** (lettrage partiel par échéance) n'est pas répliqué — non nécessaire pour un MVP artisan (déduction nette globale suffisante).

---

## Verdict

Le flux **avoir** est **sain** : on ne peut pas créditer plus que la facture (3 gardes : brouillon / avoir-total-doublon / solde restant, recalcul serveur indépendant), les lignes sont négatives avec TVA **par ligne**, et l'avoir **contre-passe correctement** dans les écritures, le **FEC**, le **CA/TVA collectée** et l'**encours client** (créé `validee` → inclus dans tous les filtres). **Aucun BLOCKER/HIGH de correctness** → **pas d'issue Linear** (les défauts connexes — PDF OPE-165, numérotation OPE-248/34, inaltérabilité OPE-118 — sont déjà tracés). Parité MVP avec le `out_refund` d'Odoo (hors rapprochement ligne-à-ligne, non requis).
