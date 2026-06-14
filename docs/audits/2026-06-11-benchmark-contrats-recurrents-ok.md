# Benchmark — Contrats récurrents (`contrats_maintenance`) vs Odoo subscription : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `contrats_maintenance` (`drizzle/schema.ts:568`) + `contratsRouter`
> (`server/routers.ts:4446`) ↔ Odoo `sale` (récurrence) / `sale_subscription`
> (abonnements — **enterprise**, absent du submodule OSS).

---

## Conclusion : domaine **au niveau MVP**. Les 4 écarts à valeur sont **déjà filés** ; le cycle d'abonnement avancé est de l'**Odoo-enterprise**. Aucun nouveau ticket.

### ✅ Modèle de contrat suffisant

| Concept | Operioz | État |
| -- | -- | -- |
| Périodicité de facturation | `periodicite` (mensuel/trimestriel/semestriel/annuel) | ✅ |
| Montant récurrent | `montantHT` + `tauxTVA` | ✅ |
| Début / fin | `dateDebut` / `dateFin` | ✅ |
| Reconduction tacite | `reconduction` (bool) | ✅ (champ présent) |
| Préavis de résiliation | `preavisResiliation` (mois) | ✅ (champ présent) |
| Prochaine échéance | `prochainFacturation` | ✅ |
| Cycle de vie | `statut` (actif/suspendu/**termine**/**annule**) | ✅ — la **terminaison** est possible via `update` |

→ Un artisan peut **créer, suspendre, terminer/annuler** un contrat (le `statut`
le permet déjà). Les champs `reconduction` + `preavisResiliation` portent la sémantique
de résiliation.

### Écarts à valeur — **déjà tracés** (anti-doublon)

| Concept | Gap Operioz | Issue |
| -- | -- | -- |
| Information avant reconduction tacite (loi Chatel L215-1) | non gérée | **OPE-108** |
| Révision/indexation annuelle du prix | montant figé | **OPE-109** |
| Génération auto des **visites** récurrentes | `prochainPassage` manuel | **OPE-132** |
| Génération auto des **factures** récurrentes | `prochainFacturation` jamais déclenché | **OPE-140** |

### Raffinement mineur (à **fusionner dans OPE-140**, pas un ticket isolé)

- **Résiliation structurée** : pas de `dateResiliation`/`motifResiliation` (la terminaison
  n'est qu'un changement de `statut`), `preavisResiliation` non **calculé/affiché** (date
  de résiliation au plus tôt), et `prochainFacturation` **non remis à NULL** à la
  terminaison. Ce dernier point est un **prérequis de correction d'OPE-140** : quand
  l'auto-facturation sera branchée, terminer un contrat **devra** stopper la facturation.
  → à **intégrer au périmètre d'OPE-140** (champs additifs + null de `prochainFacturation`
  sur `termine`/`annule`), inutile d'ouvrir un ticket séparé.

### Écarts restants = Odoo-enterprise (hors MVP)

- **Cycle d'abonnement avancé** (`sale.subscription` : stages, `close_reason_id`, MRR,
  upsell/renew automatiques, relances de paiement d'abonnement) : module **enterprise**,
  absent de l'OSS — **sur-ingénierie** pour un MVP artisan.

---

## Verdict

Le module **Contrats récurrents** est **au niveau MVP** : périodicité, montant, début/fin,
reconduction, préavis, prochaine échéance, et un `statut` permettant la
**terminaison/annulation**. Les 4 améliorations à valeur (Chatel, révision prix, visites
auto, factures auto) sont **déjà tracées** (OPE-108/109/132/140). Le raffinement de
**résiliation** (date/motif + null `prochainFacturation`) est à **fusionner dans OPE-140**
(prérequis de correction), pas un ticket séparé. Le cycle d'abonnement avancé relève de
l'**Odoo-enterprise**. **Aucun nouveau ticket benchmark.**
