# Benchmark — Notes de frais (`depenses`) vs Odoo `hr_expense` : parité MVP (réf.)

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : table `depenses` (raw SQL) + `depensesRouter` (`routers.ts:8787-8960`) +
> `DEPENSE_FIELD_MAP` (`db.ts:6150`) ↔ Odoo `hr_expense`.

---

## Conclusion : module **au niveau MVP** d'Odoo. Les 2 seuls écarts à forte valeur sont **déjà filés** (OPE-98, OPE-99). Pas de nouveau ticket.

### ✅ Couverture comparée à `hr_expense`

| Concept Odoo `hr.expense` | Operioz `depenses` | État |
| -- | -- | -- |
| Montant HT/TVA/TTC + taux | `montant_ht`/`montant_tva`/`montant_ttc`/`taux_tva` | ✅ |
| TVA déductible | `tva_deductible` | ✅ |
| Justificatif (pièce jointe) | `justificatif_url`/`justificatif_nom` | ✅ |
| OCR du reçu | `ocr_brut`/`ocr_traite` + `analyserJustificatif` (`:8889`) | ✅ (au-delà du core Odoo) |
| Catégorie / produit | `categorie`/`sous_categorie` + `getCategories`/`createCategorie` | ✅ |
| Mode de paiement (perso/société) | `mode_paiement` + `remboursable` | ✅ |
| Remboursement (état + date) | `rembourse`/`date_remboursement` | ✅ |
| Rattachement analytique | `chantier_id`/`intervention_id`/`client_id` | ✅ (rentabilité chantier) |
| Récurrence | `recurrente`/`frequence_recurrence`/`prochaine_occurrence` | ✅ (au-delà du core Odoo) |
| Cloisonnement multi-tenant | `WHERE artisan_id = ?` + `update` whitelisté (`DEPENSE_FIELD_MAP`) | ✅ (cf. audit dépenses) |

→ Le modèle de données est **plus riche** que le strict `hr.expense` core sur l'OCR, la
récurrence et le rattachement analytique.

### Écarts à forte valeur — déjà couverts (anti-doublon)

- **Indemnités kilométriques (barème) — modèle quantité × tarif** : **OPE-98** (High).
- **Détection de doublon (même justificatif / montant+date+fournisseur)** : **OPE-99**
  (Medium).

### Écarts restants = **ERP, hors périmètre MVP**

- **Note de frais (expense sheet)** regroupant N dépenses en un rapport soumis/approuvé en
  lot : Odoo `hr.expense.sheet`. Chez nous le workflow est par dépense — suffisant MVP. (La
  séparation des tâches sur l'approbation/paiement est par ailleurs filée **OPE-63**.)
- **Multi-devises**, **avances/dotations**, **paiement groupé fournisseur** : ERP, non MVP.
- **IDOR OCR** (`analyserJustificatif`/`markDepenseOcrTraite`) : déjà corrigé (**OPE-91**).

---

## Verdict

Le module **notes de frais** est **au niveau MVP** d'Odoo `hr_expense`, voire au-delà
(OCR, récurrence, analytique). Les deux seules améliorations à forte valeur (km au barème,
anti-doublon) sont **déjà tracées** (OPE-98/99). Les concepts restants d'Odoo relèvent de
l'ERP (expense sheets, multi-devises) et sont **hors périmètre 30 juin**. **Aucun nouveau
ticket benchmark.**
