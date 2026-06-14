# Audit — Division par zéro / NaN-Infinity dans les stats & calculs financiers — OK

**Date** : 2026-06-10 · **Projet** : Lancement 30 juin

> Périmètre : divisions dans les agrégations (`db.ts`) et les routeurs stats —
> `getConversionRate` (`db.ts`), moyennes d'avis (`db.ts:1726,1756`),
> `calculerAvancementChantier` (`db.ts:2371`), `getDashboardStats`, divisions de dates
> (`routers.ts`).

---

## Conclusion : toutes les divisions sont gardées. Pas de BLOCKER/HIGH.

Risque cherché : un dénominateur à **0** (0 devis envoyé, 0 phase, 0 facture…) →
`x/0 = NaN/Infinity` **stocké** ou **affiché** (« NaN % », « Infinity € ») dans un produit
de gestion. Silencieux et peu pro au lancement.

### Toutes les divisions « métier » sont protégées

| Calcul | Garde | Réf |
| -- | -- | -- |
| Taux de conversion (`acceptes / devisList.length`) | `if (devisList.length === 0) return 0;` **avant** | `getConversionRate` (`db.ts`) |
| Note moyenne avis (`sum / total`) | ternaire `total > 0 ? sum/total : 0` | `db.ts:1726`, `:1756` |
| Avancement chantier (`totalAvancement / phases.length`) | `if (phases.length === 0) return { avancement: 0 };` **avant** | `db.ts:2374-2377` |
| Dashboard (CA, marges, panier) | **agrégations SQL** (`SUM`/`COUNT`) — `SUM` de 0 ligne = `NULL` géré, pas de division JS | `getDashboardStats` |

### Les divisions des routeurs sont des conversions de durée (dénominateur constant)

`routers.ts:979/996/1097/2152/…` : `(...) / (1000*60*60*24)` (ms → jours),
`trialEndsAt` (`:8158`), etc. → **dénominateur littéral non nul** → aucun risque de div/0.

---

## Réserve (LOW, hors périmètre)

- La robustesse repose sur des gardes **dispersés** (chaque appelant). Une future stat
  oubliant le `if (len === 0)` ré-introduirait un NaN. Reco douce : helper
  `safeDiv(a, b, fallback=0)`. Non bloquant.

---

## Verdict

Aucune division non gardée dans les stats/finances : taux de conversion et avancement
**gardés en amont** (`if (len === 0) return`), moyennes en **ternaire `> 0`**, dashboard en
**SQL** (pas de division JS), durées à dénominateur constant. Pas de `NaN`/`Infinity`
injecté dans les valeurs stockées/affichées. **Pas de nouvelle issue Linear.**
