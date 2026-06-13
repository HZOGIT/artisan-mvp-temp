import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IAvisRepository } from "../../application/avis-repository";
import { listAvisEnrichi, getAvis, getAvisStats } from "../../application/read-use-cases";
import { repondreAvis, changerStatutAvis } from "../../application/write-use-cases";

const idInput = z.object({ id: z.number().int() });
// Parité legacy avisRouter : input.avisId pour repondre/moderer.
const repondreSchema = z.object({ avisId: z.number().int(), reponse: z.string().min(1).max(5000) });
const modererSchema = z.object({ avisId: z.number().int(), statut: z.enum(["publie", "masque"]) });

// Routeur tRPC du domaine avis. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
// (NotFound→404, Validation→400) au middleware. Repository injecté (DI) → testable.
// `getAll` = alias de `list` (parité legacy). Le workflow email demande d'avis
// (envoyerDemande/envoyerDemandeParClient) est traité dans une étape métier ultérieure.
export function createAvisRouter(repo: IAvisRepository) {
  return router({
    // Parité legacy : list/getAll renvoient l'avis enrichi (client + intervention).
    list: protectedProcedure.query(({ ctx }) => listAvisEnrichi(repo, ctx.tenant)),
    getAll: protectedProcedure.query(({ ctx }) => listAvisEnrichi(repo, ctx.tenant)),

    getById: protectedProcedure
      .input(idInput)
      .query(({ ctx, input }) => getAvis(repo, ctx.tenant, input.id)),

    getStats: protectedProcedure.query(({ ctx }) => getAvisStats(repo, ctx.tenant)),

    repondre: protectedProcedure
      .input(repondreSchema)
      .mutation(({ ctx, input }) => repondreAvis(repo, ctx.tenant, input.avisId, input.reponse)),

    moderer: protectedProcedure
      .input(modererSchema)
      .mutation(({ ctx, input }) => changerStatutAvis(repo, ctx.tenant, input.avisId, input.statut)),
  });
}
