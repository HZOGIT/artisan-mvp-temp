import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IAvisRepository } from "../../application/avis-repository";
import { listAvisEnrichi, getAvis, getAvisStats } from "../../application/read-use-cases";
import { repondreAvis, changerStatutAvis } from "../../application/write-use-cases";
import {
  envoyerDemandeAvis,
  envoyerDemandeAvisParClient,
  type DemandeAvisDeps,
} from "../../application/demande-avis-use-cases";

const idInput = z.object({ id: z.number().int() });
// Parité legacy avisRouter : input.avisId pour repondre/moderer.
const repondreSchema = z.object({ avisId: z.number().int(), reponse: z.string().min(1).max(5000) });
const modererSchema = z.object({ avisId: z.number().int(), statut: z.enum(["publie", "masque"]) });

// Routeur tRPC du domaine avis. Transport mince : valide les inputs (zod), délègue aux
// use-cases (scoping tenant via ctx.tenant), laisse remonter les Domain errors
// (NotFound→404, Validation→400, TooManyRequests→429) au middleware. Repository et
// dépendances du workflow demande d'avis injectés (DI) → testable.
// `getAll` = alias de `list` (parité legacy).
export function createAvisRouter(repo: IAvisRepository, demandeDeps: DemandeAvisDeps) {
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

    // Workflow demande d'avis (parité legacy) : envoi d'un lien d'avis au client.
    envoyerDemande: protectedProcedure
      .input(z.object({ interventionId: z.number().int() }))
      .mutation(({ ctx, input }) => envoyerDemandeAvis(demandeDeps, ctx.tenant, input.interventionId)),

    envoyerDemandeParClient: protectedProcedure
      .input(z.object({ clientId: z.number().int() }))
      .mutation(({ ctx, input }) => envoyerDemandeAvisParClient(demandeDeps, ctx.tenant, input.clientId)),
  });
}
