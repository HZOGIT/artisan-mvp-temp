# Audit — fix-duplicates : inventaire COMPLET des blocs hardcodés id=1 (→ OPE-49)

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Sweep exhaustif des opérations `WHERE id = 1` / `artisanId = 1` de
> `fix-duplicates.ts` (exécuté à chaque boot, sans garde `NODE_ENV`) — pour
> compléter l'inventaire d'**OPE-49** (🔴 BLOCKER).

---

## Inventaire complet (7 blocs ciblant l'artisan #1)

| Ligne | Opération sur id=1 | Type | Dans OPE-49 ? |
| -- | -- | -- | -- |
| **341-353** | `DELETE` toutes conversations + messages | **perte de données** | ajouté (commentaire 2026-06-08) |
| 555-566 | `UPDATE` vitrine (description/zone/services plombier paris) | overwrite | ✓ listé |
| 1031 | `UPDATE artisans SET plan='entreprise'` | overwrite | ✓ listé |
| 1050 | `UPDATE … onboarding_completed=TRUE` | overwrite | ✓ listé |
| 1058 | `UPDATE notifications SET lu=TRUE` | overwrite | ✓ listé |
| **1258-1270** | `INSERT IGNORE` catégories de dépense démo | seed additif | **← à ajouter** |
| **1405-1414** | `INSERT IGNORE subscriptions … 'entreprise','active'` | **seed abonnement (billing)** | **← à ajouter** |

### Les 2 non encore listés

**1405 — abonnement Entreprise gratuit seedé sur id=1** :
```sql
INSERT IGNORE INTO subscriptions (artisan_id, plan, status, trial_ends_at, max_users, ...)
SELECT id, 'entreprise', 'active', DATE_ADD(NOW(), INTERVAL 30 DAY), 10, 3, 4
FROM artisans WHERE id = 1
```
→ Le 1er artisan réel reçoit un **abonnement `entreprise`/`active` gratuit** seedé
en base (10 sièges), **hors Stripe** → premium gratuit + incohérence d'abonnement
(cumule avec `:1031` qui force déjà `plan='entreprise'`, et OPE-64/OPE-43).

**1258 — catégories de dépense démo** : `INSERT IGNORE` de 10+ catégories codées
en dur sur artisanId=1 → pollue les catégories du 1er artisan réel (additif, moins
grave).

---

## Conclusion

L'inventaire id=1 d'OPE-49 compte **7 blocs** (overwrite + **1 DELETE data-loss** +
**2 seeds dont un abonnement Entreprise gratuit**). Le **fix unique** (garde
`NODE_ENV !== 'production'` sur tout le seeding démo + suppression de **tous** les
`WHERE id/artisanId = 1`) doit couvrir les 7. → **OPE-49 complété par commentaire.**
Pas de nouvelle issue.
