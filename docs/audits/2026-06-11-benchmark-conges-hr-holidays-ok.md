# Benchmark — Congés (`conges`) vs Odoo `hr_holidays` : parité MVP

**Date** : 2026-06-11 · **Projet** : Operioz × Odoo 19 — Benchmark

> Périmètre : `conges` + `soldes_conges` (`drizzle/schema.ts`) + `congesRouter`
> (`server/routers.ts:6125`) ↔ Odoo `hr_holidays` (`hr.leave`, `hr.leave.type`,
> `hr.leave.allocation`).

---

## Conclusion : domaine **au niveau MVP**. Les écarts à valeur sont **déjà filés**. Aucun nouveau ticket.

### ✅ Modèle de données suffisant

| Concept Odoo `hr_holidays` | Operioz | État |
| -- | -- | -- |
| Type de congé (`hr.leave.type`) | `conges.type` enum : **conge_paye, rtt, maladie, sans_solde, formation, autre** (6 types) | ✅ couvre les cas artisan |
| Demi-journées (`request_unit_half`) | `demiJourneeDebut` / `demiJourneeFin` | ✅ |
| Workflow d'approbation (`state` draft/confirm/validate/refuse) | `statut` en_attente/approuve/refuse/annule | ✅ |
| Solde / compteur (`hr.leave.allocation`, `number_of_days`) | `soldes_conges` (soldeInitial/Restant, joursAcquis, joursPris) — **scopé CP/RTT** (les seuls types à solde) | ✅ correct |
| Décompte à l'approbation | `approuver` : décrément solde **+ garde d'idempotence** (un seul décompte) | ✅ (corrigé) |
| Recrédit à l'annulation/suppression | `annuler`/`delete` recréditent le solde d'un congé approuvé | ✅ (corrigé) |
| Demande (self-service ou manager) | `create(technicienId, …)` via `protectedProcedure` | ✅ |
| Vue par période / par technicien | `byPeriode`, `byTechnicien` (ownership vérifié) | ✅ |

→ Le **maintien du solde dans les deux sens** (décompte / recrédit) et l'**idempotence**
de l'approbation sont en place (cf. correctifs auto-fix précédents). `maladie`,
`sans_solde`, `formation`, `autre` n'ont **volontairement pas de solde** (comportement
correct : pas de compteur à débiter).

### Écarts à valeur — **déjà tracés** (anti-doublon)

| Concept Odoo | Gap Operioz | Issue |
| -- | -- | -- |
| Décompte en **jours ouvrés** (`resource.calendar`, exclusion week-ends/fériés) | `jours` compte les jours calendaires + fériés | **OPE-96** |
| Détection de **chevauchement** + solde insuffisant à la demande | absente | **OPE-97** |
| **Acquisition** automatique des CP (≈ 2,5 j/mois, `allocation`) | `joursAcquis` saisi à la main | **OPE-125** |
| **Période de référence** (1er juin → 31 mai) vs année civile | indexé année civile | **OPE-126** |

### Écarts restants = ERP / paie, hors MVP

- **Report / carryover** des CP non pris en fin de période, règles du **congé principal**
  (fractionnement légal), **types paramétrables** par l'utilisateur (`hr.leave.type` CRUD) :
  relèvent d'un module **paie/RH ERP** — sur-ingénierie pour un MVP artisan (l'enum fixe à
  6 types couvre le besoin réel).
- **Validation à deux niveaux** (`double_validation`), **allocation par accrual plan** :
  enterprise/ERP.

### Note mineure (hors périmètre benchmark)

`conges.create` : `motif: z.string().optional()` n'a pas de `.max()` (classe « bornes de
longueur », OPE-24) — relève de l'auto-fix, pas d'un ticket benchmark.

---

## Verdict

Le module **Congés** est **au niveau MVP** d'`hr_holidays` : 6 types, demi-journées,
workflow d'approbation, **solde maintenu dans les deux sens avec idempotence**, vues par
période/technicien cloisonnées. Les 4 améliorations à valeur (jours ouvrés, chevauchement,
acquisition, période de référence) sont **déjà tracées** (OPE-96/97/125/126). Le reste
relève de la **paie/RH ERP** (report, types paramétrables, double validation) — hors
périmètre artisan. **Aucun nouveau ticket benchmark.**
