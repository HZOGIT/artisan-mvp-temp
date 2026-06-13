# Audit — IDOR : associations article-fournisseur (lecture/écriture/suppression cross-tenant)

**Date** : 2026-06-11 · **Projet** : Lancement 30 juin · **Sévérité : 🟠 HIGH**

> Périmètre : `articlesRouter` — endpoints « Article-Fournisseur associations »
> (`routers.ts:3139-3169`) + helpers `db.ts`.

---

## Conclusion : 4 endpoints sans aucun contrôle d'ownership (handlers `async ({ input })` sans `ctx`). HIGH.

Le reste du module stock/articles est **sain** (voir plus bas). Mais les 4 routes
d'association article↔fournisseur ne destructurent **pas** `ctx` et passent les ids bruts
à des helpers DB scopés **uniquement par id** :

```ts
getArticleFournisseurs: protectedProcedure          // :3140
  .input(z.object({ articleId: z.number() }))
  .query(async ({ input }) => db.getArticleFournisseurs(input.articleId)),   // pas de ctx

getFournisseurArticles: protectedProcedure          // :3146
  .input(z.object({ fournisseurId: z.number() }))
  .query(async ({ input }) => db.getFournisseurArticles(input.fournisseurId)),

associateArticle: protectedProcedure                // :3152
  .input(z.object({ articleId, fournisseurId, referenceExterne?, prixAchat?, delaiLivraison? }))
  .mutation(async ({ input }) => db.createArticleFournisseur(input)),

dissociateArticle: protectedProcedure               // :3164
  .input(z.object({ id: z.number() }))
  .mutation(async ({ input }) => db.deleteArticleFournisseur(input.id)),
```

Helpers DB (aucun `artisanId`) :
```ts
getArticleFournisseurs(articleId): .where(eq(articlesFournisseurs.articleId, articleId))
getFournisseurArticles(fournisseurId): .where(eq(articlesFournisseurs.fournisseurId, fournisseurId))
createArticleFournisseur(data): insert direct
deleteArticleFournisseur(id): .where(eq(articlesFournisseurs.id, id))
```

`articles_fournisseurs` n'a **pas** de colonne `artisanId` (`schema.ts`) ; l'ownership se
dérive via `fournisseurs.artisanId` (NOT NULL) — donc les associations sont des **données
tenant-privées** (relations fournisseurs + **prix d'achat** `prixAchat`, références
externes, délais).

### Impact (cross-tenant)

- **`getFournisseurArticles` / `getArticleFournisseurs`** : lecture des associations
  (fournisseurs, **prix d'achat**, références) d'un **autre tenant** → fuite de données
  commerciales (qui fournit quoi, à quel prix). Ids séquentiels → énumérables.
- **`associateArticle`** : crée une association vers **n'importe quel** `fournisseurId`
  (et `articleId`) → pollution du catalogue fournisseurs d'un autre tenant + injection de
  faux prix/références.
- **`dissociateArticle`** : supprime **n'importe quelle** association par `id` → destruction
  de données d'un autre tenant.

Même classe que **OPE-10** (devisOptions `async ({ input })` sans ownership) et le constat
systémique d'**OPE-47**, mais sur une **ressource distincte** (article-fournisseur) **non
énumérée** dans les issues existantes.

### Fix proposé

Résoudre l'artisan (`getArtisanByUserId(ctx.user.id)`) et vérifier l'ownership via le
**fournisseur** (`getFournisseurById(fournisseurId).artisanId === artisan.id`) pour
`associateArticle` ; pour `dissociateArticle`, charger l'association puis vérifier que son
fournisseur appartient à l'artisan. Pour les lectures, **filtrer** les associations à
celles dont le `fournisseurId` appartient à l'artisan (requête scopée, join `fournisseurs`).
Idéalement, ajouter `artisanId` au `WHERE` côté helpers DB.

---

## Le reste du module est sain (pas d'IDOR)

- **`stocksRouter`** (`:2862`) : `getById`/`update`/`delete`/`adjustQuantity`/`getMouvements`
  vérifient **tous** `stock.artisanId !== artisan.id` ; `list`/`getLowStock` scopés. ✅
- **`articlesRouter`** articles artisan : `createArtisanArticle` force `artisanId` ;
  `updateArtisanArticle`/`deleteArtisanArticle` chargent l'article et vérifient
  `art.artisanId !== artisan.id` (le **bon** pattern). ✅
- **Bibliothèque partagée** : lecture `publicProcedure` (catalogue commun, pas de données
  tenant) ; mutations en **`adminOnlyProcedure`**. ✅

---

## Verdict

Les 4 endpoints d'association **article-fournisseur** (`routers.ts:3139-3169`) sont des
**IDOR multi-tenant** (lecture de prix d'achat + écriture/suppression d'associations sans
contrôle d'ownership) → **HIGH**. Non couvert par les issues existantes (OPE-47 énumère
véhicules + OPE-9/10/30/31/38/45/46, pas article-fournisseur). **→ Nouvelle issue Linear.**
