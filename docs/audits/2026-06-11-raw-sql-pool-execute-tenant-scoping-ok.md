# Audit — Requêtes SQL brutes (`pool.execute`) dans les routers : cloisonnement tenant OK

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : les **11** appels `pool.execute` de `server/routers.ts` (SQL brut hors
> couche Drizzle/`dbSecure`) — vérification IDOR (scope `artisanId`) + injection SQL.

---

## Conclusion : **toutes** les requêtes SQL brutes sont **cloisonnées par tenant** et **paramétrées**. Aucun IDOR, aucune injection. Aucun BLOCKER/HIGH.

### ✅ Cloisonnement `artisanId` sur 100 % des requêtes

| Site | Requête | Garde |
| -- | -- | -- |
| `:225` `persistMetier` | `UPDATE artisans SET metier WHERE id = ?` | appelé **uniquement** avec `artisan.id` (`:232`, `:248`), résolu via `getArtisanByUserId(ctx.user.id)` — jamais un id d'entrée |
| `:4142` | `SELECT metier FROM artisans WHERE id = ?` | `[artisan.id]` (caller) |
| `:8503-8556` (recherche globale, 5 requêtes) | clients/devis/factures/interventions/fournisseurs | **chacune** `WHERE artisanId = ?` avec `artisanId = artisan.id` (`:8488`), `LIMIT 5` |
| `:9173` `copierBudgetsMois` | `INSERT … SELECT … WHERE artisan_id = ?` | `[…, artisan.id, …]` — copie **intra-tenant** |
| `:9346` | `SELECT … FROM regles_categorisation WHERE artisan_id = ?` | scopé |
| `:9359` | `INSERT INTO regles_categorisation (artisan_id, …) VALUES (?, …)` | `artisan_id` = caller |
| `:9374` | `UPDATE regles_categorisation SET actif=FALSE WHERE id = ? AND artisan_id = ?` | **`AND artisan_id = ?`** → pas d'écriture cross-tenant même avec un `id` arbitraire |

→ Le point le plus sensible — un `UPDATE … WHERE id = ?` — est **doublement gardé** :
soit l'`id` est l'`artisan.id` du caller (`persistMetier`), soit la clause inclut
**`AND artisan_id = ?`** (`regles_categorisation`). **Pas d'IDOR.**

### ✅ Pas d'injection SQL

Toutes les valeurs utilisateur passent en **paramètres préparés** (`?`), y compris les
`LIKE` de la recherche (`like = \`%${q}%\`` passé en **paramètre**, pas interpolé) et le
`COLLATE` est une constante. Aucune interpolation de chaîne d'entrée dans le SQL.

---

## 🟢 Observations mineures (LOW, non bloquantes)

- `copierBudgetsMois` (`:9168`) : `moisSource`/`moisCible` sont des `z.string()` **sans
  `.max()`** ni validation de format (attendu `YYYY-MM`). **Paramétrés** → pas d'injection ;
  au pire une valeur `mois` incohérente, **intra-tenant**. Classe **bornes de longueur**
  (OPE-24) + une `.regex(/^\d{4}-\d{2}$/)` serait un plus. **LOW**, sous le seuil.

---

## Verdict

La surface **SQL brute** des routers (11 `pool.execute`) est **entièrement cloisonnée
par `artisanId`/`artisan_id`** (y compris les `UPDATE … WHERE id`, doublés d'un
`AND artisan_id = ?` ou bornés à `artisan.id`) et **100 % paramétrée** (pas de SQLi, y
compris les `LIKE`). **Aucun IDOR, aucune fuite cross-tenant, aucune injection.** Seule
réserve **LOW** : `copierBudgetsMois` accepte des `mois` non bornés/non formatés (intra-
tenant, paramétré). **Pas de nouvelle issue Linear.**
