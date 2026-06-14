import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IActiviteRepository } from "../../application/activite-repository";
import { basculerFait, creerActivite, listActivites, supprimerActivite } from "../../application/use-cases";

// Bornes alignées sur le legacy `activitesRouter.create` (defense-in-depth + colonnes `activites`).
const createSchema = z.object({
  type: z.enum(["appel", "email", "rdv", "relance", "autre"]).default("autre"),
  titre: z.string().trim().min(1).max(500),
  echeance: z.string().min(1), // date ISO (YYYY-MM-DD) ; validée/normalisée au use-case
  entiteType: z.enum(["client", "devis", "facture", "chantier", "aucun"]).optional(),
  entiteId: z.number().int().positive().optional(),
  note: z.string().max(5000).optional(),
});

// Routeur tRPC des activités (suivi commercial « à faire »). Surface client : list/create/toggleFait/
// delete. Transport mince ; scoping tenant + anti-IDOR FK dans le repo/use-case. Domain errors → 400/403.
export function createActivitesRouter(repo: IActiviteRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listActivites(repo, ctx.tenant)),

    create: protectedProcedure
      .input(createSchema)
      .mutation(({ ctx, input }) => creerActivite(repo, ctx.tenant, input)),

    toggleFait: protectedProcedure
      .input(z.object({ id: z.number().int(), fait: z.boolean() }))
      .mutation(({ ctx, input }) => basculerFait(repo, ctx.tenant, input.id, input.fait)),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(({ ctx, input }) => supprimerActivite(repo, ctx.tenant, input.id)),
  });
}
