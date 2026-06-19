import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IDevisIARepository } from "../../application/devis-ia-repository";
import type { AnalyserPhotosDeps } from "../../application/use-cases";
import { listAnalyses, getAnalyse, createAnalyse, addPhoto, updateSuggestion, genererDevis, analyserPhotos } from "../../application/use-cases";

export interface DevisIARouterDeps extends Omit<AnalyserPhotosDeps, "repo"> {
  readonly repo: IDevisIARepository;
}

/*
 * Routeur tRPC `devisIA` (analyse photos chantier → suggestions → devis). Tous protégés.
 * `analyserPhotos` = Vision multimodal ; `genererDevis` = devis brouillon depuis suggestions. Anti-IDOR
 * systématique (analyse/suggestion/client scopés tenant).
 */
export function createDevisIARouter(deps: DevisIARouterDeps) {
  const { repo } = deps;
  return router({
    list: protectedProcedure.query(({ ctx }) => listAnalyses(repo, ctx.tenant)),
    getById: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ ctx, input }) => getAnalyse(repo, ctx.tenant, input.id)),
    createAnalyse: protectedProcedure
      .input(z.object({ clientId: z.number().int().positive().optional(), titre: z.string().optional(), description: z.string().optional() }))
      .mutation(({ ctx, input }) => createAnalyse(repo, ctx.tenant, input)),
    addPhoto: protectedProcedure
      .input(z.object({ analyseId: z.number().int().positive(), url: z.string().max(65535), description: z.string().max(65535).optional(), ordre: z.number().optional() }))
      .mutation(({ ctx, input }) => addPhoto(repo, ctx.tenant, input.analyseId, { url: input.url, description: input.description, ordre: input.ordre })),
    analyserPhotos: protectedProcedure
      .input(z.object({ analyseId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => analyserPhotos(deps, ctx.tenant, input.analyseId)),
    updateSuggestion: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), selectionne: z.boolean().optional(), quantiteSuggeree: z.string().optional(), prixEstime: z.string().optional() }))
      .mutation(({ ctx, input }) => updateSuggestion(repo, ctx.tenant, input.id, { selectionne: input.selectionne, quantiteSuggeree: input.quantiteSuggeree, prixEstime: input.prixEstime })),
    genererDevis: protectedProcedure
      .input(z.object({ analyseId: z.number().int().positive(), clientId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => genererDevis(repo, ctx.tenant, { analyseId: input.analyseId, clientId: input.clientId })),
  });
}
