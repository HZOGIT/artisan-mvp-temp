import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IArticleRepository } from "../../application/article-repository";
import { listArticles, getArticle, articlesParCategorie } from "../../application/read-use-cases";
import { creerArticle, modifierArticle, supprimerArticle } from "../../application/write-use-cases";
import { suggererArticlesIA, type ArticlesIaDeps } from "../../application/suggerer-articles-ia";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Montant décimal invalide");

// Bornes alignées sur la table `articles_artisan` (defense-in-depth).
const createSchema = z.object({
  reference: z.string().min(1).max(50),
  designation: z.string().min(1).max(500),
  prixUnitaireHT: decimal,
  description: z.string().max(5000).nullish(),
  unite: z.string().max(20).optional(),
  tauxTVA: decimal.optional(),
  categorie: z.string().max(100).nullish(),
});

const updateSchema = z.object({
  reference: z.string().min(1).max(50).optional(),
  designation: z.string().min(1).max(500).optional(),
  prixUnitaireHT: decimal.optional(),
  description: z.string().max(5000).nullish(),
  unite: z.string().max(20).optional(),
  tauxTVA: decimal.optional(),
  categorie: z.string().max(100).nullish(),
});

// Routeur tRPC du domaine articles (catalogue). Transport mince : valide les inputs (zod), délègue
// aux use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors (NotFound→404,
// Validation→400). Repo injecté (DI).
export function createArticlesRouter(repo: IArticleRepository, ia?: ArticlesIaDeps) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listArticles(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getArticle(repo, ctx.tenant, input.id)),

    byCategorie: protectedProcedure
      .input(z.object({ categorie: z.string().min(1).max(100) }))
      .query(({ ctx, input }) => articlesParCategorie(repo, ctx.tenant, input.categorie)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerArticle(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierArticle(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerArticle(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Surface parité client : articles « artisan » (catalogue propre au tenant) ─────────────────
    // Le client appelle ces clés (cf. legacy `articlesRouter`). Mêmes use-cases tenant-scopés que
    // list/create/update/delete (anti-IDOR via ctx.tenant ; 404 hors tenant).
    getArtisanArticles: protectedProcedure.query(({ ctx }) => listArticles(repo, ctx.tenant)),

    createArtisanArticle: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerArticle(repo, ctx.tenant, input)),

    updateArtisanArticle: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierArticle(repo, ctx.tenant, id, data);
      }),

    deleteArtisanArticle: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerArticle(repo, ctx.tenant, input.id);
        return { success: true };
      }),

    // ── Suggestion IA d'articles (lecture seule, non persistée) ───────────────────────────────────
    // Parité legacy : dégradation silencieuse → [] si le seam IA n'est pas câblé, rate-limit atteint,
    // ou réponse non parsable (jamais d'erreur remontée au client).
    suggererArticlesIA: protectedProcedure
      .input(z.object({ query: z.string().min(2).max(200), contexte: z.string().max(2000).optional() }))
      .query(({ ctx, input }) => (ia ? suggererArticlesIA(ia, ctx.tenant, input) : [])),
  });
}
