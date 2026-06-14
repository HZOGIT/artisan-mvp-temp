# Benchmark/QA — Détection de conflit d'affectation technicien ✅ correcte (2 réserves LOW)

**Date** : 2026-06-13 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness) · **Domaine** : Planning / Interventions

> Vérification de **correctness** de `getConflitsTechnicien` (`server/db.ts:1056`), la détection
> de double-booking + congés implémentée pour OPE-110 (appelée par `interventions.assignerTechnicien`,
> `server/routers.ts:2351`). ↔ Odoo `hr_holidays` (chevauchement de congés) + planning ressources.

---

## ✅ Logique de chevauchement correcte

### Interventions (plage horaire — demi-ouverte `[début, fin)`)
`server/db.ts:1068-1074` — condition :
```
existante.dateDebut < nouvelle.dateFin  AND  COALESCE(existante.dateFin, existante.dateDebut) > nouvelle.dateDebut
```
- C'est le test de chevauchement **standard** `aStart < bEnd AND aEnd > bStart`. ✓
- **Back-to-back non bloqué** : une intervention qui finit exactement quand l'autre commence → `fin > début` est **faux** (égalité) → **pas** de conflit. Correct (créneaux contigus = OK). ✓
- **Fin nulle** gérée via `COALESCE(dateFin, dateDebut)` (intervention instantanée). ✓
- Scopé **tenant** (`artisanId`) **et** technicien ; ne considère que les statuts **`planifiee`/`en_cours`** (ignore `terminee`/`annulee`, correct) ; `excludeInterventionId` exclut l'intervention en cours d'édition (évite l'auto-conflit). ✓

### Congés (jours pleins — inclusif `[début, fin]`)
`server/db.ts:1083-1090` — condition `conges.dateDebut <= ymd(nouvelle.dateFin) AND conges.dateFin >= ymd(nouvelle.dateDebut)`, sur statut **`approuve`** uniquement.
- Test inclusif standard `aStart <= bEnd AND aEnd >= bStart`, cohérent avec Odoo `hr_holidays`/`hr_leave` (`odoo-ref/addons/hr_holidays/models/hr_leave.py` : contrainte `date_from <= date_to` `:236`, index `(date_to, date_from)` `:247`, recherche de chevauchement par `date_from`/`date_to`). ✓
- Ne déclenche que sur congés **approuvés** (un congé en_attente/refusé/annulé ne bloque pas) — comportement raisonnable. ✓

### Non bloquant (comportement préservé)
L'affectation **réussit toujours** ; les conflits sont **renvoyés** au front pour avertissement (`routers.ts:2371` `{ ...updated, conflits }`). Aligné sur l'approche Odoo (avertit, ne bloque pas par défaut). ✓

---

## 🟡 Réserve LOW 1 — la requête congés ne filtre pas `artisanId` (defense-in-depth)

`conges` porte bien `artisanId` (`schema.ts`), mais la requête de `getConflitsTechnicien` (`db.ts:1085-1090`)
filtre **seulement** `technicienId` + `statut`, **sans** `eq(conges.artisanId, artisanId)`.
- **Pas de fuite réelle** : `technicienId` est la PK auto-incrémentée de `techniciens` (donc **propre à un seul artisan**), et le `technicienId` est **validé en amont** (`assignerTechnicien` vérifie `tech.artisanId === artisan.id`, `routers.ts:2347`). Un `technicienId` ne peut donc pas pointer vers le congé d'un autre tenant.
- **Recommandation** (hardening) : ajouter `eq(conges.artisanId, artisanId)` par cohérence avec le pattern systémique de scoping tenant (toutes les autres requêtes le font). Coût : 1 ligne. **Non bloquant.**

## 🟡 Réserve LOW 2 — frontière de date UTC sur la comparaison congés

`ymd(d) = d.toISOString().slice(0,10)` (`db.ts:1082`) convertit la plage d'intervention en **YMD UTC** avant de la comparer aux colonnes `date` des congés. Une intervention proche de **minuit heure de Paris** peut être rangée sur le **jour UTC précédent** → détection congé décalée d'un jour à la frontière. **Classe déjà filée** : `docs/audits/2026-06-10-fuseau-horaire-utc-dates-fiscales.md`. **Non bloquant** (edge minuit), pas de nouveau ticket.

---

## Verdict

La détection de conflit d'affectation (`getConflitsTechnicien`) est **correcte** : math de chevauchement saine (demi-ouverte pour les interventions, inclusive pour les congés, alignée Odoo), scoping tenant + technicien + statut, `excludeId`, créneaux contigus non faussement bloqués, non bloquante (avertissement). **Aucun ticket** : 2 réserves **LOW** seulement — filtre `artisanId` defense-in-depth sur la requête congés (pas de fuite réelle) et frontière UTC (déjà filée). OPE-110 reste un bon socle ; à étendre **par membre d'équipe** une fois OPE-111 (équipe) intégré au planning.
