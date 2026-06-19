import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDevisOptionRepository } from "../../application/devis-option-repository";
import {
  convertirOptionEnDevis,
  creerOption,
  listOptions,
  selectionnerOption,
  supprimerOption,
} from "../../application/use-cases";

// Bornes alignées sur `devis_options` (nom varchar 100, description TEXT) — defense-in-depth.
const createSchema = z.object({
  devisId: z.number().int(),
  nom: z.string().max(100),
  description: z.string().max(65535).optional(),
  ordre: z.number().int().optional(),
  recommandee: z.boolean().optional(),
});

/*
 * Routeur tRPC des options (« variantes ») de devis. Surface appelée par le client : getByDevisId,
 * create, delete, select, convertirEnDevis. Transport mince ; anti-IDOR via l'appartenance du devis
 * parent (dans le repository). Domain errors → 404.
 */
export function createDevisOptionsRouter(repo: IDevisOptionRepository) {
  return router({
    getByDevisId: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => listOptions(repo, ctx.tenant, input.devisId)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerOption(repo, ctx.tenant, input)),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => supprimerOption(repo, ctx.tenant, input.id)),

    select: protectedProcedure
      .input(z.object({ optionId: z.number().int() }))
      .mutation(({ ctx, input }) => selectionnerOption(repo, ctx.tenant, input.optionId)),

    convertirEnDevis: protectedProcedure
      .input(z.object({ optionId: z.number().int() }))
      .mutation(({ ctx, input }) => convertirOptionEnDevis(repo, ctx.tenant, input.optionId)),
  });
}
