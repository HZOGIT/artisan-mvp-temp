import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import { getTodayInterventions, startIntervention, endIntervention, type InterventionsMobileDeps } from "../../application/use-cases";

const startSchema = z.object({
  interventionId: z.number().int().positive(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

/** Bornes legacy : notes ~5 000 car, signatureClient = image base64 (~500 Ko, même borne que signDevis). */
const endSchema = z.object({
  interventionId: z.number().int().positive(),
  notes: z.string().max(5000).optional(),
  signatureClient: z.string().max(500000).optional(),
});

/*
 * Routeur tRPC `interventionsMobile` (app mobile technicien). Transport mince : délègue aux use-cases
 * scopés `ctx.tenant`. RGPD : la liste du jour applique la data-minimisation par rôle technicien.
 */
export function createInterventionsMobileRouter(deps: InterventionsMobileDeps) {
  return router({
    getTodayInterventions: protectedProcedure.query(({ ctx }) => getTodayInterventions(deps, ctx.tenant)),
    startIntervention: protectedProcedure.input(startSchema).mutation(({ ctx, input }) => startIntervention(deps, ctx.tenant, input)),
    endIntervention: protectedProcedure.input(endSchema).mutation(({ ctx, input }) => endIntervention(deps, ctx.tenant, input)),
  });
}
