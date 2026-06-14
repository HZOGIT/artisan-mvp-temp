# Audit — `getDashboardStats` : scoping tenant de chaque agrégation SQL — OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `getDashboardStats` (`db.ts`) — les agrégations SQL parallèles alimentant le
> dashboard (CA, compteurs).

---

## Conclusion : toutes les agrégations scopées `artisanId`. Pas de BLOCKER/HIGH.

Risque cherché : une **seule** agrégation sans `WHERE artisanId` = **fuite cross-tenant**
du **chiffre d'affaires** et des compteurs (un tenant voit le CA d'un autre).

### Vérification : 9/9 agrégations scopées **et** paramétrées

`Promise.all([...])` de `pool.execute(...)` :

| Agrégation | Clause |
| -- | -- |
| `SUM(totalTTC)` factures (×3 variantes) | `WHERE artisanId = ?` + `[artisanId]` |
| `COUNT` devis (×2) | `WHERE artisanId = ?` |
| `COUNT` clients | `WHERE artisanId = ?` |
| `COUNT` interventions (×2) | `WHERE artisanId = ?` |
| `COUNT` factures | `WHERE artisanId = ?` |

→ **Chaque** requête filtre `artisanId = ?` avec le **paramètre lié** `[artisanId]` (pas
d'interpolation → pas d'injection). **Aucune** agrégation non scopée.

`artisanId` provient du `ctx` des appelants (`getArtisanByUserId(ctx.user.id)`) → chaîne de
cloisonnement complète : `ctx.user.id` → `artisan.id` → `WHERE artisanId = ?`.

---

## Note

- La justesse **comptable** du CA (calculé **TTC** au lieu de **HT**, avoirs non déduits)
  est un sujet **distinct** **déjà filé** (dashboard CA TTC vs HT) — orthogonal au
  **scoping** vérifié ici (qui, lui, est correct).

---

## Verdict

Les 9 agrégations SQL du dashboard sont **toutes** `WHERE artisanId = ?` **paramétrées** →
**pas de fuite cross-tenant** du CA ni des compteurs, pas d'injection. **Pas de nouvelle
issue Linear.**
