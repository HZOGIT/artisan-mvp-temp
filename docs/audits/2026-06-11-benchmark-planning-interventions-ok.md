# Benchmark — Planning / Interventions vs Odoo `project` (FSM enterprise) : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `interventions` (`schema.ts:232`) + `interventions_mobile` (`:636`) +
> `disponibilites_techniciens` + `interventionsRouter`/mobile ↔ Odoo `project.task`
> (le module Field Service `industry_fsm` est **enterprise**, absent du submodule OSS).

---

## Conclusion : module **au niveau MVP** (et au-delà sur l'exécution mobile). Les écarts à forte valeur sont **déjà filés** (OPE-110, OPE-111, OPE-106). Pas de nouveau ticket.

### ✅ Modèle d'exécution terrain riche (au-delà de `project.task` OSS)

`interventions_mobile` : **géolocalisation** (`latitude`/`longitude`), **pointage**
(`heureArrivee`/`heureDepart`), **notes**, **signature client** (`signatureClient` +
`signatureDate`), **synchronisation offline** (`syncStatus` synced/pending/error +
`lastSyncAt`). → couvre un vrai usage **Field Service** (arrivée/départ, preuve sur place,
signature, mode déconnecté) que le `project.task` **OSS** d'Odoo n'a pas (le FSM réel
`industry_fsm` est **enterprise**).

`interventions` : `dateDebut`/`dateFin`, `statut` (planifiee/en_cours/terminee/annulee),
`technicienId`, liens `devisId`/`factureId`, `adresse`. Machine d'états mobile auditée
(`interventions-mobile-state-machine-ok`). `disponibilites_techniciens` (horaires hebdo).

| Concept Odoo `project.task` | Operioz | État |
| -- | -- | -- |
| Dates planifiées / échéance (`date_deadline` `:183`) | `dateDebut`/`dateFin` | ✅ |
| Assigné(s) (`user_ids`) | `technicienId` (mono) → **OPE-111** (multi) | 🟠 filé |
| Temps alloué (`allocated_hours` `:196`) | — → **OPE-106** (heures chantier) | 🟠 filé |
| Exécution terrain (GPS, pointage, signature, offline) | `interventions_mobile` | ✅ (au-delà de l'OSS) |
| Détection de conflit ressource | absente → **OPE-110** | 🟠 filé |

### Écarts à forte valeur — déjà couverts (anti-doublon)

- **Conflit d'affectation** (chevauchement + congés) : **OPE-110** (High).
- **Multi-techniciens** sur une intervention : **OPE-111** (Medium).
- **Heures allouées/réalisées** (≈ `allocated_hours`) : **OPE-106** (sur chantiers/phases) +
  **OPE-123** (taux horaire).

### Écarts restants = enterprise / ERP, hors MVP

- **Worksheets FSM** (fiches d'intervention paramétrables, checklists), **planification
  automatique / Gantt**, **règles de tournée/optimisation** : module `industry_fsm`
  **enterprise** — sur-ingénierie pour un MVP artisan.
- **Récurrence des interventions** (visites de contrat) : déjà filée **OPE-132**.

---

## Verdict

Le module **planning / interventions** est **au niveau MVP** d'Odoo et **dépasse l'OSS** sur
l'exécution mobile (GPS, pointage, signature, offline). Les trois améliorations à valeur
(conflit d'affectation, multi-techniciens, heures) sont **déjà tracées** (OPE-110/111/106).
Le reste relève du **Field Service enterprise** (worksheets, optimisation de tournées),
hors périmètre MVP. **Aucun nouveau ticket benchmark.**
