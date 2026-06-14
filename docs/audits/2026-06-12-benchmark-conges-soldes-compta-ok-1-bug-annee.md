# QA — Compta des soldes de congés : bookkeeping **sain** (idempotent + recrédit symétrique) sauf 1 bug d'année → OPE-126. Pas de nouveau ticket.

**Date** : 2026-06-12 · **Projet** : Operioz × Odoo 19 — Benchmark (QA correctness)

> Revue de la mise à jour des `soldes_conges` lors de approuver / annuler / delete
> (`server/routers.ts:6206-6291`) ↔ Odoo `hr.leave` (décompte/recrédit d'allocation).

---

## ✅ Sain : idempotence + recrédit symétrique + ownership

- **`approuver`** (`:6206`) : décompte le solde **uniquement** sur la transition vers `approuve`
  (garde `conge.statut !== 'approuve'`, `:6219`) → une ré-approbation (double-clic/rejeu) **ne re-décompte pas**. ✅
- **`annuler`** (`:6248`) / **`delete`** (`:6271`) : recréditent **uniquement** si `statut === 'approuve'`
  (`:6260/:6281`) → **ni recrédit spurious** (en_attente/refuse n'avaient rien décompté), **ni
  double-recrédit** (après l'opération, statut ≠ `approuve`). ✅
- `updateSoldeConges` (`db.ts:4748`) applique correctement le **delta signé** :
  `joursPris += delta`, `soldeRestant = GREATEST(0, soldeRestant − delta)`. Décompte (+jours) et
  recrédit (−jours) **s'annulent exactement**. ✅
- Le décompte et le recrédit utilisent la **même formule** de jours → la sur-estimation
  jours-calendaires (**OPE-96**, distinct) **se compense** au recrédit (pas de dérive interne).
- **Ownership OPE-45** vérifié sur les 4 mutations (`conge.artisanId === artisan.id`). ✅

## 🐛 Seul défaut : année de référence figée sur « maintenant » → corruption inter-années (rattaché à OPE-126)

`approuver`/`annuler`/`delete` ciblent `soldes_conges(annee = new Date().getFullYear())` — l'année
**courante**, pas celle du congé. Si un congé est **approuvé en N puis annulé/supprimé en N+1** :
`soldes(N)` reste décompté, `soldes(N+1)` reçoit un **crédit fantôme** → solde corrompu sur deux
exercices. Cas réaliste : annulation en janvier d'un congé approuvé en décembre.

→ **Commenté sur OPE-126** (ticket « soldes indexés année civile / période de référence ») : la
correction est d'utiliser une **année/période dérivée du congé** (`dateDebut`) pour le décompte ET
le recrédit. Pas de nouveau ticket (anti-doublon, même racine que OPE-126).

---

## Verdict

La **comptabilité des soldes de congés** est **robuste** (idempotente, recrédit symétrique,
tenant-scopée). Le seul bug — **année de référence = `now`** au lieu de celle du congé (corruption
si approbation/annulation franchissent une année) — est **rattaché à OPE-126**. Décompte en jours
ouvrés = OPE-96. **Aucun nouveau ticket benchmark.**
