import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IRegleCategorisationRepository } from "../../application/regle-categorisation-repository";
import { listRegles, getRegle } from "../../application/read-use-cases";
import { creerRegle, modifierRegle, supprimerRegle } from "../../application/write-use-cases";

// Bornes alignées sur la table `regles_categorisation` (defense-in-depth).
const createSchema = z.object({
  motifLibelle: z.string().min(1).max(255),
  categorie: z.string().min(1).max(50),
  actif: z.boolean().optional(),
});

const updateSchema = z.object({
  motifLibelle: z.string().min(1).max(255).optional(),
  categorie: z.string().min(1).max(50).optional(),
  actif: z.boolean().optional(),
});

/*
 * Routeur tRPC du domaine regles-categorisation (catalogue de règles de catégorisation auto).
 * Transport mince : valide les inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant),
 * laisse remonter les Domain errors (NotFound→404, Validation→400). Repo injecté.
 */
export function createReglesCategorisationRouter(repo: IRegleCategorisationRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listRegles(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getRegle(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerRegle(repo, ctx.tenant, input)),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return modifierRegle(repo, ctx.tenant, id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerRegle(repo, ctx.tenant, input.id);
        return { success: true };
      }),
  });
}
