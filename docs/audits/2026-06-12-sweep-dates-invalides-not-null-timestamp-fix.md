# Sweep QA — `new Date(input.X)` non gardé → Invalid Date dans colonne NOT NULL (→ 500 MySQL). Classe « date invalide » (suite).

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA, classe de bug) · **Sévérité : 🟡 MEDIUM** · **✅ CORRIGÉ (MODE A, commit 204f4ce)**
**Type** : sweep d'une classe de bug déjà partiellement remédiée (alimente la file AUTO-FIX MODE A). **Pas de ticket** (même classe que les fixes 06-12 ci-dessous ; robustesse, pas un gap Odoo).

> **Fix déployé (commit 204f4ce)** : les **4 sites NON gardés** ci-dessous (`conges.create`,
> `createInterventionContrat`, `vehicules.createEntretien`, `rdvEnLigne.reprogrammer`) reçoivent
> désormais le garde `isNaN(d.getTime())` → `BAD_REQUEST` avant l'insert.
> **Fix déployé (commit e91a79d)** : les 2 sites « à vérifier » sont aussi gardés —
> `markAsPaid.datePaiement` (garde AVANT la génération d'écritures) + `addKilometrage.dateReleve`
> (NOT NULL). **Classe « date invalide » : sweep terminé.**

---

## Classe

`const d = new Date(input.<champ>)` sur une **string utilisateur** insérée dans une colonne
**`date()`/`timestamp()` `.notNull()`** : si la string est invalide (client obsolète, appel API
direct, copier-coller), `new Date("garbage")` = **Invalid Date** → drizzle sérialise une valeur
de date invalide → **MySQL strict mode rejette** → **500** (ou corruption sur colonne `date`).
Atténué en usage normal (les date-pickers du front émettent des ISO valides), donc **MEDIUM** :
ce n'est pas un BLOCKER 30 juin mais une fragilité d'un parcours cœur sur entrée malformée.

## ✅ Déjà gardés (référence du pattern)

`interventions.create` (`routers.ts:2127`), `contrats.create` (`:4800`), `rdv.demander`
(`:4661`) font : `const d = new Date(input.x); if (isNaN(d.getTime())) throw BAD_REQUEST(...)`.
(cf. audits `…-date-invalide-guard-fix.md` du 06-12.)

## ❌ Sites NON gardés → insert dans une colonne NOT NULL (à corriger, même pattern)

| Endpoint | routers.ts | Colonne cible (NOT NULL) | Risque |
|---|---|---|---|
| `conges.create` | `:6501-6502` | `conges.dateDebut` / `dateFin` (`date().notNull()`) | 500 sur date invalide ; **+** ces dates pilotent le décompte de solde (cf. OPE-126) → garder tôt |
| `createInterventionContrat` | `:4989` | `interventions_contrat.dateIntervention` (`timestamp().notNull()`) | 500 |
| `vehicules…createEntretien` | `:6826` | `entretiens_vehicules.dateEntretien` (`date().notNull()`) | 500 |
| `rdvEnLigne…reprogrammer` | `:8232` | `rdv_en_ligne.dateProposee` (`timestamp().notNull()`) | 500 — **le jumeau `demander` est gardé (`:4661`), pas celui-ci** |

### À vérifier (priorité moindre — colonne nullable mais valeur invalide quand même rejetée)

- `factures.markAsPaid` (`:1699`) → `datePaiement: new Date(input.datePaiement)` (`datePaiement`
  nullable, mais une **valeur** invalide est rejetée par MySQL même sur colonne nullable — seul
  `NULL` est accepté, pas « Invalid Date »). Gardé conseillé si `input.datePaiement` peut être fourni.
- `vehicules…createReleveKilometrage` (`:6799`) `dateReleve`, autres `dateXxx` sur colonnes NOT NULL
  non listées : appliquer la même grille (`new Date(input.x)` + colonne NOT NULL ⇒ garde).

## Fix (par site, behavior-preserving — pattern existant)

```ts
const dateDebut = new Date(input.dateDebut);
if (isNaN(dateDebut.getTime())) {
  throw new TRPCError({ code: "BAD_REQUEST", message: "Date invalide" });
}
// idem pour chaque date NOT NULL ; pour les dates optionnelles, garder seulement si fournie.
```

Une date valide (sélecteur front) passe **à l'identique** → aucun impact sur le parcours nominal.

## Odoo 19 (cadrage)

L'ORM Odoo (`fields.Date` / `fields.Datetime`) **parse et valide** toute écriture de date
(format strict, conversion, rejet si invalide) — la validation est **centralisée au write**.
Côté Operioz (Drizzle + parsing manuel), la garde doit être posée **explicitement** à chaque
point d'entrée ; d'où ce sweep.

## Action

**Alimente AUTO-FIX MODE A** : 4 sites NON gardés (conges.create, createInterventionContrat,
createEntretien, rdvEnLigne.reprogrammer) — chacun = ajout du garde `isNaN(getTime())` +
`BAD_REQUEST`, **fix safe / behavior-preserving / faible blast radius**. **Pas de nouveau ticket**
(robustesse, même classe que les 3 fixes déjà déployés).
