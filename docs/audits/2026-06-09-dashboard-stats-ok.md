# Audit — `getDashboardStats` (figures du tableau de bord) — OK

**Date** : 2026-06-09 · **Projet** : Lancement 30 juin

> Périmètre : `getDashboardStats` (`db.ts:1421`) — le premier écran de l'artisan.
> Complète `dashboard-ca-ttc-vs-ht.md` (qui visait le CA).

---

## Conclusion : figures cohérentes. Pas de BLOCKER/HIGH nouveau.

### Calculs vérifiés

| Figure | Requête | Verdict |
| -- | -- | -- |
| `caMonth` / `caYear` | `SUM(totalTTC) WHERE statut='payee' AND (MONTH/YEAR)(COALESCE(datePaiement, createdAt))=courant` | **TTC** → OPE-53 |
| `facturesImpayees` {count,total} | `WHERE statut NOT IN ('payee','annulee','brouillon')` | **correct** : exclut bien brouillon/annulée ✓ |
| `devisEnCours` | `COUNT devis WHERE statut IN ('brouillon','envoye')` | OK |
| `totalClients` / `totalDevis` / `totalFactures` / `totalInterventions` | `COUNT(*)` scopé `artisanId` | OK |
| `interventionsAVenir` | `COUNT WHERE statut='planifiee' AND dateDebut >= NOW()` | OK |

- **Agrégation SQL efficiente** (refactor depuis l'ancien O(N) mémoire Node) ; tout
  scopé `artisanId`.
- **Impayés = la version correcte** : exclut `brouillon`/`annulee`/`payee`. À noter
  l'**incohérence** avec `statistiques.getFacturesStats` qui, lui, **inclut**
  `brouillon` dans `montantImpaye` (cf. `chantiers-statistiques-ok.md`) → c'est le
  dashboard qui a raison ; aligner `getFacturesStats`.

---

## Réserves (déjà tracées)

- **CA en TTC** (`caMonth`/`caYear` = `SUM(totalTTC)`) → **OPE-53**.
- **`facturesImpayees.total` = `SUM(totalTTC)`** sans déduire `montantPaye` : un
  acompte partiel ferait surévaluer l'impayé… mais aujourd'hui masqué car un
  paiement partiel marque déjà `payee` (**OPE-60**). Au fix d'OPE-60, déduire le
  `montantPaye` ici (solde restant, pas le TTC plein).
- `COALESCE(datePaiement, createdAt)` pour rattacher le CA au mois : si une facture
  passe `payee` sans `datePaiement`, le CA est rattaché à sa date de **création**
  (approximation acceptable ; `markAsPaid` pose normalement `datePaiement`).

---

## Verdict

Tableau de bord **cohérent et scopé** ; impayés correctement calculés (exclut les
brouillons). Réserves = CA TTC (**OPE-53**) et impayé plein vs solde (**OPE-60**),
déjà filées. Reco mineure : aligner `statistiques.getFacturesStats` sur le filtre
brouillon du dashboard. **Pas d'issue Linear.**
