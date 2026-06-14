import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IArticleRepository } from "../../application/article-repository";
import { listArticles, getArticle } from "../../application/read-use-cases";
import { creerArticle, modifierArticle, supprimerArticle } from "../../application/write-use-cases";

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
export function createArticlesRouter(repo: IArticleRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listArticles(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getArticle(repo, ctx.tenant, input.id)),

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
  });
}
