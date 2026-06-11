# Benchmark — Projets / Chantiers (`chantiers`) vs Odoo `project` : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `chantiers` (`schema.ts:1293`) + `phases_chantier` (`:1320`) +
> `interventions_chantier`/`documents_chantier`/`suivi_chantier`/`analyses_photos_chantier`
> + `chantiersRouter` ↔ Odoo `project`.

---

## Conclusion : module **au niveau MVP** d'Odoo `project`. Les 2 écarts à forte valeur sont **déjà filés** (OPE-106, OPE-107). Pas de nouveau ticket.

### ✅ Couverture comparée à `project`

| Concept Odoo `project` | Operioz `chantiers` | État |
| -- | -- | -- |
| Projet (dates, statut, responsable) | `chantiers` : `dateDebut`/`dateFinPrevue`/`dateFinReelle`, `statut`, `priorite`, `avancement` | ✅ |
| Étapes / jalons (`project.task.type`, `project.milestone.is_reached`) | `phases_chantier` : `ordre`, dates prévues/réelles, `statut`, `avancement`, `budgetPhase`/`coutReel` | ✅ (phases = étapes **avec budget**) |
| Tâches / interventions | `interventions_chantier` + association `interventions` (`associerIntervention` double-vérifiée) | ✅ |
| Documents | `documents_chantier` (+ `analyses_photos_chantier` IA) | ✅ (au-delà du core) |
| Suivi client / avancement | `suivi_chantier` (`visibleClient`) + `calculerAvancementChantier` | ✅ |
| Budget projet | `budgetPrevisionnel`/`budgetRealise` (chantier) + `budgetPhase`/`coutReel` (phase) | ✅ (modèle présent) |
| Cloisonnement multi-tenant | `assertChantierOwner` systématique + double-garde sur associations | ✅ (**implémentation de référence**, cf. audit chantiers) |

→ Le modèle est **complet** pour un MVP : phases budgétées (≈ étapes + jalons), interventions
associées, documents/photos, suivi client, avancement calculé.

### Écarts à forte valeur — déjà couverts (anti-doublon)

- **Heures de main-d'œuvre (prévues vs réalisées)** : **OPE-106** (High).
- **Coût réel / rentabilité auto-agrégés** (dépenses + heures + achats) : **OPE-107** (High)
  — le `budgetRealise`/`coutReel` existe mais n'est pas alimenté automatiquement.
- **Taux horaire technicien** (prérequis du coût main-d'œuvre) : **OPE-123**.

### Écarts restants = marginaux ou couverts ailleurs

- **`project.milestone` séparé** (jalon léger avec `is_reached`) : nos `phases_chantier`
  jouent déjà ce rôle (dates + statut + avancement). Concept **redondant** au MVP.
- **Facturation à l'avancement / par jalon** (situations de travaux) : relève de l'**acompte /
  facture d'acompte** déjà filé **OPE-117** + des règlements **OPE-116**. Pas de doublon à créer.
- **Kanban multi-colonnes / sous-tâches / dépendances** : ERP, **hors périmètre** MVP.

---

## Verdict

Le module **chantiers** est **au niveau MVP** d'Odoo `project`, avec en bonus l'analyse photos
IA et un **cloisonnement exemplaire**. Les deux seules améliorations à forte valeur (heures,
rentabilité) sont **déjà tracées** (OPE-106/107, + OPE-123 pour le taux). Les concepts Odoo
restants sont soit **redondants** (milestones ≈ phases), soit **couverts ailleurs**
(facturation à l'avancement = OPE-116/117), soit **ERP** (kanban/sous-tâches). **Aucun nouveau
ticket benchmark.**
