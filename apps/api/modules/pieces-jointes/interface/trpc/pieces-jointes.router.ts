import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IPiecesJointesRepository } from "../../application/pieces-jointes-repository";
import type { StoragePort } from "../../../../shared/ports/storage";
import { listerPiecesDevis, listerPiecesFacture, supprimerPiece } from "../../application/pieces-jointes-use-cases";

export function createPiecesJointesRouter(repo: IPiecesJointesRepository, storage: StoragePort) {
  return router({
    listByDevis: protectedProcedure
      .input(z.object({ devisId: z.number().int() }))
      .query(({ ctx, input }) => listerPiecesDevis(repo, storage, ctx.tenant, input.devisId)),

    listByFacture: protectedProcedure
      .input(z.object({ factureId: z.number().int() }))
      .query(({ ctx, input }) => listerPiecesFacture(repo, storage, ctx.tenant, input.factureId)),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => supprimerPiece(repo, ctx.tenant, input.id)),
  });
}
