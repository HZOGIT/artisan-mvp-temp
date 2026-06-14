# Audit — Fournisseurs : CRUD core (scope tenant) — OK ; associations = déjà filé

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin

> Périmètre : `fournisseursRouter` (`routers.ts:3040-3145`) — CRUD
> (`list/getById/create/update/delete`) et associations article-fournisseur.

---

## Conclusion : CRUD core cloisonné tenant. L'IDOR associations est **déjà filé**.

### CRUD core — ownership vérifié (pas d'IDOR)

| Procédure | Garde | Réf |
| -- | -- | -- |
| `list` | `getFournisseursByArtisanIdSecure(artisan.id)` | `:3044` |
| `getById` | `fournisseur.artisanId !== artisan.id → null` | `:3054` |
| `create` | `createFournisseur({ artisanId: artisan.id, …input })` (forcé) | `:3074` |
| `update` | charge → `fournisseur.artisanId !== artisan.id → FORBIDDEN` | `:3095` |
| `delete` | charge → `fournisseur.artisanId !== artisan.id → FORBIDDEN` | `:3111` |

→ Création/lecture/modif/suppression d'un fournisseur **étranger** = rejetées. Pas d'IDOR
sur le CRUD core.

### Associations article-fournisseur — IDOR **déjà filé**

`getArticleFournisseurs` (`:3119`), `getFournisseurArticles` (`:3125`),
`associateArticle` (`:3131`), `dissociateArticle` (`:3143`) sont des handlers
**`async ({ input })` sans `ctx`** → **aucun** contrôle d'appartenance (signature
systémique de l'IDOR). → **déjà filé** (`fournisseurs-associations-idor`). Pas de doublon.

---

## Verdict

Le **CRUD core** des fournisseurs est **tenant-scopé** (artisanId vérifié sur
get/update/delete, forcé sur create). Le **seul** trou — les **procédures d'association**
sans `ctx` (IDOR) — est **déjà filé**. **Pas de nouvelle issue Linear.**
