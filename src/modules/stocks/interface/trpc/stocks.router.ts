import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IStockRepository } from "../../application/stock-repository";
import { listStocks, getStock } from "../../application/read-use-cases";
import { creerStock, modifierStock, supprimerStock } from "../../application/write-use-cases";

const decimal = z.string().regex(/^\d+(\.\d{1,2})?$/, "Valeur décimale invalide");

// Bornes alignées sur la table `stocks` (defense-in-depth).
const createSchema = z.object({
  articleId: z.number().int().nullish(),
  articleType: z.enum(["bibliotheque", "artisan"]).optional(),
  reference: z.string().min(1).max(50),
  designation: z.string().min(1).max(500),
  quantiteEnStock: decimal.optional(),
  seuilAlerte: decimal.optional(),
  unite: z.string().max(20).optional(),
  prixAchat: decimal.nullish(),
  emplacement: z.string().max(100).nullish(),
  fournisseur: z.string().max(255).nullish(),
});

// ⚠️ `quantiteEnStock` ABSENT du schéma d'update : la quantité ne change que via un
// mouvement tracé (invariant d'audit).
const updateSchema = z.object({
  reference: z.string().min(1).max(50).optional(),
  designation: z.string().min(1).max(500).optional(),
  seuilAlerte: decimal.optional(),
  unite: z.string().max(20).optional(),
  prixAchat: decimal.nullish(),
  emplacement: z.string().max(100).nullish(),
  fournisseur: z.string().max(255).nullish(),
});

// Routeur tRPC du domaine stocks. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
// (NotFound→404, Validation→400). Repository injecté (DI) → testable.
export function createStocksRouter(repo: IStockRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listStocks(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getStock(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerStock(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierStock(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerStock(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
