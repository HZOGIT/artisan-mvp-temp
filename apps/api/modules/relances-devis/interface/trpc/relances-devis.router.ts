import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IRelanceDevisRepository } from "../../application/relance-devis-repository";
import { listRelances, relancesParDevis, getRelance } from "../../application/read-use-cases";
import { enregistrerRelance, supprimerRelance } from "../../application/write-use-cases";
import { STATUTS_RELANCE, TYPES_RELANCE } from "../../domain/relance-devis";

/** Bornes alignées sur la table `relances_devis` (defense-in-depth). Enums réutilisés du domaine. */
const createSchema = z.object({
  devisId: z.number().int(),
  type: z.enum(TYPES_RELANCE),
  destinataire: z.string().max(320).nullish(),
  message: z.string().max(5000).nullish(),
  statut: z.enum(STATUTS_RELANCE).optional(),
});

/*
 * Routeur tRPC du domaine relances-devis (journal append-only). Transport mince : valide les inputs
 * (zod), délègue aux use-cases (scoping tenant via ctx.tenant + anti-IDOR devisId au use-case),
 * laisse remonter les Domain errors (NotFound→404, Validation→400). ⚠️ PAS de procédure `update` :
 * une relance est immuable. Repo injecté.
 */
export function createRelancesDevisRouter(repo: IRelanceDevisRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listRelances(repo, ctx.tenant)),

    byDevis: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => relancesParDevis(repo, ctx.tenant, input.devisId)),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(({ ctx, input }) => getRelance(repo, ctx.tenant, input.id)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(async ({ ctx, input }) => {
        const result = await enregistrerRelance(repo, ctx.tenant, input);
        ctx.log.info({ event: "relance_devis_envoyee", devisId: input.devisId, type: input.type, statut: input.statut ?? "envoyee" }, `Relance devis enregistrée (${input.type})`);
        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ ctx, input }) => {
        await supprimerRelance(repo, ctx.tenant, input.id);
        ctx.log.warn({ event: "relance_devis_supprimee", relanceId: input.id }, "Relance devis supprimée");
        return { success: true };
      }),
  });
}
