import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { DbClient } from "../../../../shared/db";
import { outboxEvent } from "../../../../shared/events/outbox-event";
import { withOutbox } from "../../../../shared/events/with-outbox";
import type { IRegleCategorisationRepository } from "../../application/regle-categorisation-repository";
import { listRegles, getRegle } from "../../application/read-use-cases";
import { creerRegle, modifierRegle, supprimerRegle } from "../../application/write-use-cases";

/** Bornes alignées sur la table `regles_categorisation` (defense-in-depth). */
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
export function createReglesCategorisationRouter(repo: IRegleCategorisationRepository, db?: DbClient) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listRegles(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getRegle(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) =>
        withOutbox(db, repo, async (r, tx) => {
          const result = await creerRegle(r, ctx.tenant, input);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "regle_categorisation.creee", entityType: "regle_categorisation", entityId: result.id, payload: { regleId: result.id, motCle: result.motifLibelle, categorieId: result.categorie } });
          return result;
        }),
      ),

    update: protectedProcedure
      .input(z.object({ id: z.number().int() }).and(updateSchema))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return withOutbox(db, repo, async (r, tx) => {
          const result = await modifierRegle(r, ctx.tenant, id, data);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "regle_categorisation.modifiee", entityType: "regle_categorisation", entityId: id, payload: { regleId: id } });
          return result;
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        return withOutbox(db, repo, async (r, tx) => {
          const before = await r.getById(ctx.tenant, input.id);
          await supprimerRegle(r, ctx.tenant, input.id);
          if (tx) await outboxEvent(tx, ctx.tenant, { action: "regle_categorisation.supprimee", entityType: "regle_categorisation", entityId: input.id, payload: { snapshot: { regleId: input.id, motCle: before?.motifLibelle } } });
          return { success: true };
        });
      }),
  });
}
