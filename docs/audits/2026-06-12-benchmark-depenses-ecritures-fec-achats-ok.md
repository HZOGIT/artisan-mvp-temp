# Benchmark — Dépenses → écritures comptables / FEC journal des achats vs Odoo `account` : parité MVP. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : génération des écritures d'achat dans le FEC à partir des `depenses`
> (`server/db.ts:5602` journal AC, `compteChargeDepense` `:5468`) ↔ Odoo `account`
> (`account.move` d'achat + `account.account` par charge / `product` expense account).

---

## Conclusion : le mapping **catégorie de dépense → compte de charge PCG** est correct et complet pour un MVP. Aucun nouveau ticket.

### ✅ Ventilation des charges par compte PCG (vérifié)

`compteChargeDepense(categorie)` (`server/db.ts:5468`) **mappe réellement** la catégorie de la
dépense vers le bon compte du plan comptable (pas un compte unique fourre-tout) :

| Catégorie (regex) | Compte | Libellé |
| -- | -- | -- |
| matériau/fourniture/consommable | **601000** | Achats de matières premières |
| sous-traitance | **604000** | Sous-traitance |
| carburant/essence/gazole | **606100** | Carburants |
| outillage | **615000** | Entretien, réparations, outillage |
| loyer/location | **613000** | Locations |
| assurance | **616000** | Primes d'assurance |
| téléphone/internet/télécom | **626000** | Frais postaux et télécom |
| formation | **623000** | Formation |
| bancaire/commission | **627000** | Services bancaires |
| repas/déplacement/hôtel/péage | **625100** | Voyages et déplacements |
| (défaut) | 607000 | Achats |

→ L'écriture d'achat est **équilibrée** : débit charge (601…/607…) + débit `445660` (TVA
déductible) / crédit `401` Fournisseurs au TTC (`db.ts:5616-5618`), avec **compte auxiliaire
fournisseur**. C'est conforme à la logique Odoo (`account.move` d'achat, compte de charge issu
du produit/catégorie). **Suffisant pour un MVP artisan.**

### Écarts du domaine = **déjà filés**

| Concept | Gap Operioz | Issue |
| -- | -- | -- |
| **Déductibilité partielle** de la TVA (carburant 80 %, etc.) | `tva_deductible` = **booléen** tout-ou-rien → sur-déduction | **OPE-153** |
| Indemnités kilométriques (km × barème) | déplacements non convertis en dépense | **OPE-169** |
| Doublon de dépense (même justificatif) | aucun contrôle | **OPE-99** |
| Notes de frais remboursables : compte personnel (421/425) vs 401 | crédité en 401 | **OPE-163** |
| PO fournisseur ↔ dépense/facture | non liés | **OPE-101** |

### Écarts restants = ERP / hors MVP

- **Compte de charge éditable par catégorie** (table de mapping configurable façon
  `account.account` + règle produit) plutôt que regex en dur : raffinement ERP. Le mapping
  actuel couvre les postes d'un artisan ; une **config fine** est de la sur-ingénierie pour le
  30 juin (le défaut 607 capte le reste).

---

## Verdict

La **comptabilisation des dépenses** (journal des achats du FEC) est **au niveau MVP** : le
**mapping catégorie → compte PCG** est réel et bien dimensionné, l'écriture est équilibrée avec
TVA déductible + auxiliaire fournisseur. Les écarts à valeur (déductibilité partielle **OPE-153**,
IK **OPE-169**, doublons **OPE-99**, compte personnel **OPE-163**) sont **déjà tracés**.
**Aucun nouveau ticket benchmark.**

> Sondages également déjà couverts ce firing : suivi « devis vu par le client » = **OPE-152**.
