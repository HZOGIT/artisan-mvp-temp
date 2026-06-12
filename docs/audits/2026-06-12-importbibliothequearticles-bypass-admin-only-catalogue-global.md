# Audit — `importBibliothequeArticles` : bypass de l'admin-only sur le catalogue GLOBAL (+ array non borné)

**Date** : 2026-06-12 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH** · **✅ CORRIGÉ (MODE A)**

> **Fix déployé** : `importBibliothequeArticles` passé en `adminOnlyProcedure` (aligné sur
> create/update/delete) + array borné `.max(2000)`. Ferme le bypass d'autorisation et le DoS.
> OPE-181.

> `articlesRouter.importBibliothequeArticles` (`server/routers.ts:583`).
> **Supersede partiellement** la conclusion « bibliothèque = mutations admin-only, OK »
> de `docs/audits/2026-06-08-articles-crud-bibliotheque-ok.md` (qui a **omis cet endpoint**).

---

## Constat

`bibliotheque_articles` est un **catalogue de référence GLOBAL** (pas de colonne `artisanId`),
**servi en lecture à TOUS les tenants** via `getBibliotheque`/`list`/`search`. Ses mutations
unitaires sont **réservées aux admins Operioz** :

```ts
// routers.ts:527/541/…  (adminOnlyProcedure = requireRole("admin"))
createBibliothequeArticle: adminOnlyProcedure …
updateBibliothequeArticle: adminOnlyProcedure …
deleteBibliothequeArticle: adminOnlyProcedure …
```

**MAIS** l'import en masse ne l'est pas (`routers.ts:583`) :

```ts
importBibliothequeArticles: protectedProcedure          // ← N'IMPORTE QUEL user authentifié
  .input(z.array(z.object({ nom, description, unite, prix_base, categorie, sous_categorie, metier })))
  //                       ^^^^^^^ AUCUN .max() → array non borné
  .mutation(async ({ input }) => {                       // ← pas de ctx, aucun contrôle de rôle
    for (const article of input) {
      await db.createBibliothequeArticle(article);       // ← INSERT séquentiel dans le catalogue global
    }
  })
```

## Impact

### 1. 🟠 Bypass d'autorisation → pollution cross-tenant du catalogue partagé
`createBibliothequeArticle` est `adminOnlyProcedure`, mais `importBibliothequeArticles`
(`protectedProcedure`) **appelle exactement la même écriture** sans aucun gate de rôle. → un
artisan (ou un collaborateur **`technicien`/`secretaire`**, voire un compte bas-privilège
compromis) peut **insérer des articles arbitraires** (`nom`, `prix_base`, `metier` choisis) dans
le catalogue **vu par tous les autres tenants**. Spam, prix faux, contenu trompeur visibles dans
la recherche d'articles de **chaque** artisan. C'est précisément le risque que l'audit du 8 juin
disait écarté (« un artisan ne peut pas polluer le catalogue des autres tenants ✓ ») — la porte
dérobée `import*` avait été **manquée**.

### 2. 🟠 Déni de service (array non borné)
Aucun `.max()` sur l'array + body global 50 Mo (cf. OPE-24) → **dizaines de milliers** d'objets
possibles, bouclés en **INSERT séquentiels** (`await` par itération) → saturation du pool MySQL,
app bloquée pour tous les tenants. Même classe que le **problème 2 d'OPE-24** (`importFromExcel`),
mais ici **non borné** et **sur une table globale**.

## Preuve

- `server/routers.ts:583` : `importBibliothequeArticles: protectedProcedure` ; mutation `({ input })`
  sans `ctx` ni `requireRole`.
- `server/routers.ts:527` : `createBibliothequeArticle: adminOnlyProcedure` (l'écriture unitaire
  équivalente est, elle, admin-only).
- `server/db.ts` `getBibliothequeArticles` : lecture globale (pas de scope tenant).
- `adminOnlyProcedure = requireRole("admin")` (`server/_core/trpc.ts:61`).

## Fix proposé (~10 min, safe)

1. **Passer `importBibliothequeArticles` en `adminOnlyProcedure`** (aligné sur create/update/delete,
   conforme à l'intention « catalogue géré par Operioz »).
2. **Borner l'array** : `z.array(...).max(2000)` (defense-in-depth anti-DoS).
3. (Souhaitable) insertion **par batch** plutôt que N `await` séquentiels.

→ Behavior-preserving pour l'usage admin légitime (le bouton d'import de la page Articles reste
fonctionnel pour un admin) ; ferme le bypass et le DoS.

## Linear

Nouvelle issue **« Lancement 30 juin »** (HIGH). Distinct d'OPE-24 (rate-limit voice/import/body —
le bypass d'autorisation n'y est pas) et d'OPE-44/88 (import factures/xlsx). Corrige l'angle mort
de l'audit `2026-06-08-articles-crud-bibliotheque-ok.md`.
