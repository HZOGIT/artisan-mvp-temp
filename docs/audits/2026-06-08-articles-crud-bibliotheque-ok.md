# Audit — Articles : CRUD artisan & bibliothèque partagée — OK

**Date** : 2026-06-08 · **Projet** : Lancement 30 juin

> Périmètre : `articlesRouter` (`routers.ts:257`) — articles propres à l'artisan
> (`getArtisanArticles`/`create`/`update`/`delete`) et bibliothèque de référence
> partagée (`createBibliothequeArticle`/`update`/`delete`). Complète l'audit
> `2026-06-08-config-import-articles-ok.md` (qui couvrait les **lectures publiques**
> `getBibliotheque`/`list`/`search`).

---

## Conclusion : pas de BLOCKER/HIGH. Module sain.

### Articles artisan — CRUD scopé

- `getArtisanArticles` : `getArticlesArtisan(artisan.id)` (scopé).
- `createArtisanArticle` : rattache `artisanId: artisan.id`.
- **`updateArtisanArticle` / `deleteArtisanArticle`** : chargent l'article puis
  vérifient **`art.artisanId !== artisan.id` ⇒ NOT_FOUND** (`:361`, `:374`,
  commentaires « SECURITE » explicites). **Pas d'IDOR.**

### Bibliothèque partagée — mutations admin-only

La bibliothèque (`bibliotheque_articles`) est **partagée en lecture** par tous les
artisans (catalogue métier + prix marché). Ses **mutations** sont correctement
réservées aux **admins Operioz** :

```typescript
// routers.ts:385,399,415
createBibliothequeArticle: adminOnlyProcedure …
updateBibliothequeArticle: adminOnlyProcedure …
deleteBibliothequeArticle: adminOnlyProcedure …
```

`adminOnlyProcedure = requireRole("admin")` et `requireRole` **applique bien**
`if (!allowedRoles.includes(ctx.user.role)) throw FORBIDDEN` (`trpc.ts`). Un
artisan (role `artisan`/`secretaire`/`technicien`) **ne peut pas** polluer/effacer
le catalogue vu par les autres tenants. ✓

### IA — bornée

`suggererArticlesIA` : `protectedProcedure` + `checkRateLimit(artisan.id)`
(`:298`) → pas d'abus de coût Gemini.

---

## Rappel (déjà tracé)

- Le repli `role || "admin"` de `getUserFromRequest` (footgun latent, **non
  exploitable** car `users.role` est `notNull().default("artisan")`) toucherait
  aussi `requireRole`/`adminOnly` → documenté en réserve dans
  `2026-06-08-auth-hashing-jwt-ok.md` (fail-closed recommandé). Pas de nouvelle
  entrée.

---

## Verdict

`articlesRouter` **vérifié sain** : CRUD artisan ownership-checké (pas d'IDOR),
mutations de la bibliothèque partagée **admin-only** (`requireRole("admin")`
effectif), IA rate-limitée. **Pas d'issue Linear créée.**
