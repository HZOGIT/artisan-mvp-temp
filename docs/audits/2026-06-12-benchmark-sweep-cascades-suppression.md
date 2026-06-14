# Benchmark/QA — Sweep complet « cascades de suppression » (orphelins, schéma sans FK)

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe « cascades »)

> Sweep des `deleteX` de `server/db.ts` (aucune contrainte FK en base → cascades manuelles).
> ↔ Odoo `ondelete` (`cascade`/`restrict`/`set null`) + `active=False` (archivage). Anti-doublon :
> consolidé dans **OPE-177** (cascade) ; technicien dans l'audit du 08-06 + **OPE-62** (géoloc).

---

## ✅ Cascades complètes (rien à faire)

| `deleteX` | Enfants nettoyés |
|---|---|
| `deleteChantier` (`:2461`) | documents_chantier, interventions_chantier, phases_chantier, suivi_chantier |
| `deleteDevis` (`:518`) | devis_lignes, devis_options(+lignes), relances_devis (signatures laissées volontairement, OPE-50) |
| `deleteCommandeFournisseur` (`:1319`) | lignes_commandes_fournisseurs |
| `deleteVehicule` (`:4625`) | historique_kilometrage, entretiens_vehicules, assurances_vehicules |

## ✅ Soft-delete (bonne approche — préserve l'historique)

- `deleteCategorieDepense` (`:6625`) : `UPDATE … actif=FALSE` (les dépenses gardent leur catégorie).

## ✅ Protégé par garde de statut (orphelins non atteignables)

- `deleteFacture` (`:785`) ne nettoie que `factures_lignes`, **mais** `factures.delete`
  (`routers.ts:1591`) **refuse tout statut ≠ `brouillon`**. Un brouillon n'a ni `ecritures_comptables`,
  ni `paiements_stripe`, ni avoir (`factureOrigineId`) → ces orphelins ne sont **pas atteignables**.
  (cf. `2026-06-12-suppression-factures-cycle-de-vie-ok.md`.)

## ❌ Incomplètes (déjà filées)

| `deleteX` | Orphelins | Statut |
|---|---|---|
| `deleteIntervention` (`:932`) | enfants intervention | **OPE-177** |
| `deleteContrat` (`:3282`) | `factures_recurrentes` (`contratId`), `interventions_contrat` (`contratId`) | **OPE-177** (précisé) |
| `deleteTechnicien` (`:2112`) | interventions, disponibilites, conges, soldes_conges, positions, badges | audit 08-06 (MEDIUM) → **ajouté à OPE-177** ; géoloc = **OPE-62** |
| `deleteClient` | factures/devis (intégrité doc) | `2026-06-08-suppression-client-casse-factures.md` (OPE-73) |

## Reco transverse (Odoo-aligné)

Odoo n'efface presque jamais une entité à historique : `active=False` (archivage) + `ondelete`
ciblé. Pour Operioz : **soft-delete `statut=inactif`** pour technicien/client/contrat (historique
légal/opérationnel) plutôt que hard-delete+cascade ; cascade manuelle OK pour les enfants purement
opérationnels (lignes, options, suivi). Le schéma `techniciens.statut` prévoit déjà `inactif`.

## Verdict

Classe **cascades** globalement **saine** : 4 cascades complètes + 1 soft-delete correct + 1
protégé par garde de statut. Les 3-4 incomplètes restantes (intervention, contrat, technicien,
client) sont **déjà filées** (OPE-177 / OPE-62 / OPE-73). **Pas de nouveau ticket** ; OPE-177
enrichi (périmètre précisé + `deleteContrat` enfants + `deleteTechnicien` ajouté).
