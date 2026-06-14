# Benchmark — Banque / rapprochement bancaire vs Odoo `account` : couverture déjà complète. Aucun nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : import de relevé + transactions bancaires (`server/routers.ts:9259` `getTransactionsBancaires`,
> `:9268` `convertirTransaction`, `:9311` `ignorerTransaction` ; `server/db.ts:6712`) ↔ Odoo
> `account` (`account.bank.statement` / `account.bank.statement.line` + réconciliation).

---

## Conclusion : domaine **au niveau MVP** ; tous les écarts à valeur sont **déjà filés**. Aucun nouveau ticket.

### Notre état (vérifié)

- Import de relevé CSV → `transactions_bancaires` (raw SQL).
- `convertirTransaction` (`routers.ts:9268`) transforme une transaction **débit → dépense** (`createDepense`), avec **garde d'idempotence** (`depense_id` déjà posé → refus, `:9284`) et lien `lierTransactionDepense`.
- `ignorerTransaction` (`:9311`) écarte une ligne.

### Écart structurant identifié = **déjà filé**

- **Les encaissements (crédits) ne sont pas rapprochés des factures impayées** : `convertirTransaction` ne gère que le flux **débit→dépense** ; un virement client reçu ne peut pas être **pointé/lettré** contre une facture pour la marquer « payée ». C'est le cœur de la réconciliation Odoo (`account.bank.statement.line` → `account.move` débit **et** crédit).
  → **Déjà OPE-147** (High) — formulation exacte du gap.

### Autres écarts du domaine = **déjà tracés**

| Concept Odoo | Gap Operioz | Issue |
| -- | -- | -- |
| Import relevé robuste (mapping de colonnes, formats banques, OFX/CAMT) | heuristique colonnes fixes (`date=0/libellé=1/montant=2`, `DD/MM/YYYY`) | **OPE-137** |
| Détail des règlements (`account.payment`, multi-règlements) | `montantPaye`/`datePaiement`/`modePaiement` agrégés sur la facture | **OPE-116** |
| Référence de paiement / QR virement pour faciliter le pointage | absente | **OPE-159** |

### Écarts restants = ERP / hors MVP

- **Réconciliation automatique par règles** (`account.reconcile.model` : matching auto montant+référence+date), lettrage partiel multi-lignes, états de rapprochement comptables : c'est un **module de réconciliation ERP**. Le MVP « pointer manuellement crédit↔facture » (OPE-147) suffit largement pour un artisan.

---

## Verdict

Le **rapprochement bancaire** est **au niveau MVP** côté débits (transaction→dépense, idempotent,
tenant-scopé — cf. audits sécurité `rapprochement-bancaire-*`). Le manque côté **crédits→factures**
est **déjà OPE-147**, l'import fragile **OPE-137**, le détail des règlements **OPE-116**, la
référence de virement **OPE-159**. **Aucun nouveau ticket benchmark.**

> NB méthodo : 5ᵉ domaine cœur consécutif déjà couvert (stock, contrats, congés, chantiers,
> banque). Le projet benchmark est **saturé** sur les modules cœur ; les prochains firings
> viseront des angles encore vierges et **Odoo-groundables** (ex. unités de mesure structurées,
> positions fiscales/mapping taxes par client, facturation au temps passé `sale_timesheet`)
> plutôt que de re-balayer les domaines déjà comparés.
