# Benchmark/QA — Dépenses : calcul HT/TVA/TTC **correct & server-authoritative** + scoping tenant OK. Seul défaut = OPE-39 (conversion bancaire négative, toujours LIVE, enrichi). Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness)

> Domaine : Dépenses / achats (`depenses` ↔ Odoo `account.move` type `in_invoice` / `hr.expense`).
> Cible : correctness des montants (HT/TVA/TTC) sur les **3 chemins de création** + isolation tenant.

---

## ✅ Calcul des montants — correct sur les 3 chemins

1. **Création manuelle** (`routers.ts:8958-8959`) : `montantTva = +(HT × taux/100).toFixed(2)`,
   `montantTtc = +(HT + TVA).toFixed(2)` — **calculé serveur**, le client ne peut pas imposer un
   TVA/TTC incohérent.
2. **Mise à jour** (`db.ts updateDepense:6278-6290`) : recalcule `montant_tva`/`montant_ttc` dès
   que `montantHt` **ou** `tauxTva` change → la cohérence est maintenue à l'édition (réserve mineure :
   modifier `montantTtc` **seul**, sans toucher HT/taux, n'est pas recalculé — cas-bord improbable).
3. **Conversion bancaire** (`routers.ts:9330-9331`) : reverse-VAT depuis le TTC —
   `HT = TTC/(1+taux)`, `TVA = TTC − HT` → **HT + TVA = TTC exact** (la TVA absorbe le résidu d'arrondi).
   Math interne correcte.

## ✅ Isolation multi-tenant — OK

`getDepensesByArtisan`, `getDepenseById(id, artisanId)`, `updateDepense(id, artisanId)`,
`deleteDepense(id, artisanId)`, `markDepenseOcrTraite(id, artisanId)` : **tous scopés par
`artisanId`** (OPE-91 déjà corrigé). `deleteDepense` cascade `notes_frais_depenses` (lien
opérationnel) — propre.

## 🐛 Seul défaut — déjà filé OPE-39 (HIGH), **toujours LIVE**, enrichi

La **conversion bancaire** réutilise le `montant` stocké **négatif** pour un débit
(`routers.ts:9286`) **sans `Math.abs`** (`:9328`) → dépense à `montantHt/TVA/TTC` **négatifs** →
TVA déductible faussée → **CA3** fausse + **FEC achats** négatif. Vérifié toujours présent sur le
code courant ; commentaire posté sur **OPE-39** avec n° de ligne à jour. Durcissements intervenus
depuis (hors signe) : **garde d'idempotence** `depense_id` (`:9324`) et **borne `importReleve`**
(`max(5 Mo)` + cap 5000 lignes) — ce volet secondaire d'OPE-39 est **clos**. **Pas de nouveau ticket.**

> Observation mineure (non filée) : la conversion bancaire **suppose `tauxTva = 20`** en dur
> (`:9329`). Acceptable pour un MVP (corrigeable via `updateDepense` qui recalcule), mais
> sur-évalue la TVA déductible pour un achat à 10 %/5,5 % jusqu'à correction manuelle. À garder en
> tête si le rapprochement bancaire monte en charge (Odoo laisse choisir la taxe sur la ligne de
> contrepartie).

---

## Verdict

Le **moteur de montants des dépenses** est **sain** (calcul serveur, équilibré, tenant-scopé). Le
seul vrai défaut de correctness est **OPE-39** (signe négatif à la conversion bancaire), **déjà
filé** et confirmé toujours actif (enrichi). **Aucun nouveau ticket.**
