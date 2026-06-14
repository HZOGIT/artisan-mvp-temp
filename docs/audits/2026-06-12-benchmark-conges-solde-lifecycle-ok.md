# Benchmark/QA — Congés : cycle de vie du solde (décompte / recrédit / idempotence) — ✅ CORRECT. Aucun ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA de correctness, RH)

> Vérification de la **maintenance du solde de congés** (`soldes_conges`) à travers le cycle
> `create → approuver → annuler/delete`, après le correctif OPE-126. ↔ Odoo `hr_holidays`
> (allocation/leave + `number_of_days`). Domaine sensible : un solde **mal maintenu** = jours
> perdus pour le salarié OU congés indus.

---

## Conclusion : le solde est maintenu correctement **dans les deux sens**, idempotent, scopé tenant, indexé sur le bon exercice. Au niveau Odoo pour le périmètre MVP.

### ✅ Décompte à l'approbation — idempotent

`congesRouter.approuver` (`server/routers.ts:6607`) :
- Décompte **uniquement** sur la transition vers `approuve` (`if (conge.statut !== 'approuve')`, `:6620`) → une **ré-approbation** (double-clic / re-jeu) **ne re-décompte pas** (l'anti-pattern « solde additif re-décompté » est gardé). ✅
- Décompte seulement pour `conge_paye`/`rtt` (`:6630`) — maladie/sans-solde/formation n'entament pas le solde CP. ✅

### ✅ Recrédit à l'annulation ET à la suppression — gardé par statut

`annuler` (`:6652`) et `delete` (`:6676`) recréditent (`updateSoldeConges(..., -jours)`) **uniquement** si `conge.statut === 'approuve'` (`:6664` / `:6686`) :
- Un congé **non décompté** (`en_attente`/`refuse`) annulé/supprimé → **pas** de recrédit erroné. ✅
- Après annulation, `statut='annule'` → un 2ᵉ appel ne recrédite pas (pas de **double-recrédit**). ✅
- Le `delete` recrédite **avant** le hard-delete (le congé est encore lisible). ✅

### ✅ Symétrie décompte/recrédit (mêmes jours, même exercice)

- `jours` recalculé **à l'identique** dans approuver/annuler/delete (`Math.ceil(|fin−debut|/jour)+1` − demi-journées), donc le recrédit restitue **exactement** ce qui avait été décompté. ✅
- **OPE-126** : décompte **et** recrédit indexés sur `dateDebut.getFullYear()` (l'année **du congé**, pas l'année courante) → un congé approuvé en N puis annulé en N+1 décompte ET recrédite `soldes(N)` (pas de corruption inter-exercices). ✅

### ✅ Pas de fenêtre de corruption par modification

Le `congesRouter` (`:6550`) n'expose **aucun** endpoint `update`/`modifier` : un congé ne peut pas voir ses **dates modifiées après création**. Donc le scénario « approuver (décompte X j) → modifier les dates (Y j) → annuler (recrédit Y j) → solde faux de (Y−X) » **n'existe pas** ici. ✅ (Robustesse par absence de surface de modification.)

### ✅ Isolation multi-tenant + RH

- `approuver`/`refuser`/`annuler`/`delete` vérifient `conge.artisanId === artisan.id` (**OPE-45**) → pas d'approbation/annulation cross-tenant. ✅
- `getSoldes` passe par `assertTechnicienOwner` (OPE-31/45) → le solde RH d'un salarié n'est lisible que par son tenant. ✅

## Odoo 19

`addons/hr_holidays` : `hr.leave.number_of_days` décompté de l'allocation à la validation, restitué à l'annulation (`action_refuse`/`action_draft`) ; allocation par **type** et par **période**. Operioz reproduit l'essentiel pour le MVP : décompte/recrédit par **type** (`conge_paye`/`rtt`) et par **année**, idempotent.

## Réserve = déjà filée (pas un défaut de ce cycle)

- **Décompte en jours CALENDAIRES inclusifs** (week-ends/fériés FR non exclus) → relève d'**OPE-96** (jours ouvrés), **déjà filé**. C'est un choix de **base de calcul**, pas une erreur de maintenance du solde (le décompte et le recrédit utilisent la **même** base, donc le solde reste cohérent en interne).

## Verdict

Le cycle de vie du solde de congés est **correct et robuste** : décompte idempotent à l'approbation, recrédit gardé par statut à l'annulation **et** la suppression, jours symétriques, exercice correct (OPE-126), pas de surface de modification des dates, scoping tenant (OPE-45). Le finding du **2026-06-10** (annulation/suppression ne recréditaient pas) est **corrigé**. **Aucun nouveau ticket.** Seule nuance ouverte = jours ouvrés **OPE-96** (déjà tracé).
