# Benchmark/QA — Achats : commande fournisseur (totaux + cascade) **sains**. Gap PO↔dépense = OPE-101 (enrichi).

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness, domaine achats)

> `commandesFournisseursRouter` (`server/routers.ts:3786-4007`) + `deleteCommandeFournisseur`
> (`server/db.ts:1194`) + `createDepense` (`server/db.ts:6230`) ↔ Odoo `purchase`
> (`purchase_order.py` : `invoice_status` / `qty_to_invoice`).

---

## ✅ Totaux PO corrects et multi-taux

`create` (`:3793-3801`) et `update` (`:3879-3891`) calculent **par ligne** :
`ligneHT = quantite × prixUnitaire`, `ligneTVA = ligneHT × (tauxTVA ?? 20)/100`, puis
`totalHT = Σ ligneHT`, `totalTVA = Σ ligneTVA`, `totalTTC = totalHT + totalTVA`. → **pas de
TVA lumpée** à un taux unique ; chaque ligne porte son propre taux (défaut 20 %). Les lignes
sont recréées de façon cohérente avec l'entête (mêmes formules). ✓
*(Réserve mineure systémique : `montantTotal` par ligne et les totaux sont chacun `.toFixed(2)`
indépendamment → la somme des lignes arrondies peut s'écarter d'1 cent du total arrondi. Même
pattern que devis/factures, non spécifique aux achats, négligeable.)*

## ✅ Cascade de suppression propre

`deleteCommandeFournisseur` (`db.ts:1194`) supprime **d'abord** `lignes_commandes_fournisseurs`
(`where commandeId = id`) **puis** l'entête → **aucune ligne orpheline** (pas de FK ondelete,
cascade manuelle correcte). Contraste avec OPE (deleteIntervention/deleteContrat) où la cascade
était incomplète. ✓

## ✅ Réception (OPE-100) cohérente

`recevoir` (`:3943`) ne met à jour que les `ligneId` **appartenant à la commande** (set
`idsCommande`) → pas d'écriture cross-commande ; le statut est **dérivé** des quantités reçues
(source de vérité = lignes). Ownership vérifié (`commande.artisanId === artisan.id`). ✓

## ↪ Scoping FK d'entrée — déjà couvert (OPE-47)

`create`/`update` n'isolent pas `fournisseurId`/`articleId`/`stockId` par `artisanId` →
référence cross-tenant possible. **Déjà filé** : audit `2026-06-09-commandes-fournisseurs-idor-fk.md`,
rattaché à **OPE-47**. Pas de doublon ici.

## ↪ Gap PO → dépense (vendor bill) — déjà OPE-101 (enrichi ce jour)

Une commande `livree` ne produit **aucune dépense** (pas de `account.move`/vendor bill auto comme
Odoo `action_create_invoice` + `invoice_status`). **Déjà filé : OPE-101.** Enrichi d'une précision
data-model : `depenses` (SQL brut, `createDepense` `db.ts:6230`) porte `fournisseur` en **VARCHAR
libre — pas une FK** vers `fournisseurs`, et n'a **ni `fournisseur_id` ni `commande_id`** → le
lien proposé devrait inclure `depenses.fournisseur_id` (FK nullable) pour permettre un **encours
fournisseur** (et fiabiliser **OPE-135**). Commenté sur OPE-101.

---

## Verdict

Le **chemin monétaire** des commandes fournisseurs (totaux multi-taux, cascade de suppression,
réception scopée) est **correct**. Les écarts restants (scoping FK d'entrée, PO→dépense,
performances fournisseurs) sont **déjà filés** (OPE-47 / OPE-101 / OPE-135). **Aucun nouveau
ticket** ; OPE-101 enrichi (FK fournisseur sur les dépenses).
