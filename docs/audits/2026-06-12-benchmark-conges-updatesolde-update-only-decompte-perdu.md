# Benchmark/QA — Congés : `updateSoldeConges` est UPDATE-only → décompte SILENCIEUSEMENT PERDU si le solde n'existe pas. Ticket benchmark.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness)

> Vérification de la chaîne de décompte des soldes de congés
> (`congesRouter.approuver/annuler/delete` + `db.updateSoldeConges`) ↔ Odoo `hr.leave` /
> `hr.leave.allocation` (solde **dérivé** des allocations, jamais « ligne manquante »).

---

## ✅ Ce qui est correct (confirme/étend l'audit soldes antérieur)

- **Formule de jours identique** dans `approuver` (`routers.ts:6334-6339`), `annuler` (`:6374-6378`)
  et `delete` (`:6395-6399`) : `Math.ceil(|fin−debut|/86400000) + 1`, puis `−0.5` par demi-journée.
  Même-jour → 1 ; N jours → N ; demi-journées symétriques. **Décompte = recrédit** (symétrique).
- **Garde de type identique** : décompte **et** recrédit ne touchent le solde que pour
  `conge_paye`/`rtt`. Pas d'asymétrie de type.
- **Idempotence** : `approuver` garde `statut !== 'approuve'` ; `annuler`/`delete` gardent
  `statut === 'approuve'`. ✅ (déjà vérifié)

## 🐛 Bug : `updateSoldeConges` ne fait qu'`UPDATE` → décompte perdu si la ligne de solde n'existe pas

`db.updateSoldeConges` (`server/db.ts`) :
```sql
UPDATE soldes_conges
   SET joursPris = joursPris + ?, soldeRestant = GREATEST(0, soldeRestant - ?)
 WHERE technicienId = ? AND type = ? AND annee = ?
```
**Aucun INSERT / upsert.** Si **aucune ligne** n'existe pour `(technicienId, type, annee)`, l'UPDATE
affecte **0 ligne** → le décompte (ou le recrédit) est **silencieusement ignoré**. Le congé est
quand même **approuvé** (`updateCongeStatut('approuve')` au `:6346`), mais **le solde n'est jamais
décrémenté**.

Or les lignes `soldes_conges` ne sont créées **que** par `initSoldeConges` (`db.ts:4773`, INSERT …
ON DUPLICATE KEY), appelée **manuellement** via `initSolde` (`routers.ts:6414`). Il n'y a **aucune
auto-création** (ni à la création du technicien, ni à l'approbation). Donc :

- **Approuver un congé avant d'avoir initialisé le solde** (type/année) → décompte **perdu**.
- **Changement d'année** (réaliste/récurrent) : approuver un congé en année N+1 sans avoir
  initialisé le solde N+1 → décompte **perdu** (aucun rollover automatique des soldes).

→ Le suivi des soldes devient **faux silencieusement** : un salarié peut consommer des congés sans
que le solde bouge, jusqu'à ce qu'un `initSolde` (qui **écrase** `joursPris`/`soldeRestant` avec les
valeurs fournies) soit fait — effaçant au passage les décomptes éventuels.

### Odoo 19

`hr.leave` ne « met pas à jour une ligne de solde » : le solde (`hr.leave.allocation`,
`number_of_days` restant) est **dérivé** des allocations validées vs congés pris. Il n'y a pas de
cas « ligne de solde absente → mise à jour silencieusement ignorée » : une demande sans allocation
couvrante est **refusée**, pas comptée à blanc.

## Amélioration proposée (additif, non destructif)

1. **`updateSoldeConges` en UPSERT** : `INSERT … (joursPris=delta, soldeRestant=GREATEST(0,
   joursAcquis−delta)…) ON DUPLICATE KEY UPDATE joursPris=joursPris+?, soldeRestant=GREATEST(0,
   soldeRestant−?)`. À défaut de `soldeInitial` connu, créer la ligne à 0 (le décompte est alors
   tracé, et un `initSolde` ultérieur posera l'acquis). **A minima**, ne plus **perdre** le décompte.
2. (Mieux) **garde de pré-condition** : refuser/avertir à l'`approuver` si aucun solde n'est
   initialisé pour `(technicien, type, année)` — cohérent avec OPE-97 (détection de solde
   insuffisant). 
3. (Lié) **rollover annuel** des soldes (auto-créer l'année N+1) — recoupe OPE-125 (acquisition).

## Linear / anti-doublon

**Distinct** d'OPE-96 (jours ouvrés), OPE-126 (année de référence figée), OPE-97 (détection
chevauchement/solde insuffisant à la demande) et OPE-125 (acquisition automatique). Ici = **perte
silencieuse du décompte par UPDATE sans ligne**. → **Nouveau ticket benchmark** (correctness).

---

## Verdict

Formule de jours + symétrie décompte/recrédit + idempotence = **corrects**. Mais
`updateSoldeConges` **UPDATE-only** **perd silencieusement** le décompte quand la ligne de solde
n'existe pas (solde non initialisé / changement d'année) → **suivi des soldes faux**. Ticket
benchmark créé (correctness, MVP moyen).
