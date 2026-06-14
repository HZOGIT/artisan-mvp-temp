# Benchmark/vérif — Conversion devis → facture (`createFactureFromDevis`) : copie fidèle — OK

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Vérification ciblée du flux cœur `createFactureFromDevis` (`server/db.ts:633`) ↔ Odoo
> `sale.order._create_invoices` : fidélité des données copiées (lignes, TVA par taux,
> champs) et garde-fous.

---

## Conclusion : la conversion **copie fidèlement** le devis (lignes + TVA par taux + champs). Les 2 incomplétudes (échéance, idempotence) sont **déjà filées**. Aucun ticket.

### ✅ Copie fidèle des données

- **En-tête** : `objet`, `conditionsPaiement`, `notes`, `totalHT/TVA/TTC` repris du devis,
  `devisId` lié, **nouveau numéro** (`getNextFactureNumber`), `dateFacture` = défaut now.
- **Lignes** (`:661-676`) : **toutes** copiées avec `ordre`, `reference`, `designation`,
  `description`, `quantite`, `unite`, `prixUnitaireHT`, **`tauxTVA` (par ligne)**,
  `montantHT/TVA/TTC`. → **pas d'aplatissement**, **TVA multi-taux préservée**.
- `typeDocument` = défaut `facture` (correct).

→ Aucune perte de donnée, la facture reflète le devis ligne à ligne.

### Incomplétudes = **déjà filées** (pas de doublon)

| Point | Issue |
| -- | -- |
| **`dateEcheance` non calculée** à la conversion (facture sans date d'échéance → aging/relances dégradés) | **OPE-94** (conditions structurées + échéance auto) |
| **Pas de garde d'idempotence** : 2 appels = 2 factures (double facturation) | **OPE-68** (convertToFacture sans garde) |

### Note

- Le report d'un **acompte** déjà facturé et le **report de la référence client** au moment
  de la conversion relèvent respectivement d'**OPE-117** (acompte) et **OPE-158** (réf
  client). La **facturation à l'avancement** (plusieurs factures partielles depuis un devis)
  est **OPE-160**.

---

## Verdict

`createFactureFromDevis` est **fidèle** : en-tête + **toutes les lignes avec TVA par taux**
copiées sans perte, lien `devisId`, nouveau numéro. Les deux manques réels (échéance auto,
idempotence) sont **déjà tracés** (OPE-94, OPE-68), et les enrichissements (acompte, réf
client, avancement) couverts par OPE-117/158/160. **Aucun nouveau ticket benchmark.**
