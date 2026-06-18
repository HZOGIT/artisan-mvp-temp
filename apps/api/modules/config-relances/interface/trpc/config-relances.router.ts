import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IConfigRelancesRepository } from "../../application/config-relances-repository";
import { getConfigRelances } from "../../application/read-use-cases";
import { mettreAJourConfigRelances } from "../../application/write-use-cases";

// Bornes alignées sur la table `config_relances_auto` (defense-in-depth). La validation fine de
// `joursEnvoi` (entiers 1..7) reste portée par le use-case.
const updateSchema = z.object({
  actif: z.boolean().optional(),
  joursApresEnvoi: z.number().int().min(1).optional(),
  joursEntreRelances: z.number().int().min(1).optional(),
  nombreMaxRelances: z.number().int().min(1).max(10).optional(),
  heureEnvoi: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  joursEnvoi: z.string().max(50).optional(),
  modeleEmailId: z.number().int().min(1).nullish(),
});

// Routeur tRPC du domaine config-relances (configuration des relances auto, singleton par tenant).
// Transport mince : valide les inputs (zod), délègue aux use-cases (scoping tenant via ctx.tenant),
// laisse remonter les Domain errors (Validation→400). Repo injecté (DI).
export function createConfigRelancesRouter(repo: IConfigRelancesRepository) {
  return router({
    get: protectedProcedure.query(({ ctx }) => getConfigRelances(repo, ctx.tenant)),

    update: protectedProcedure
      .input(updateSchema)
      .mutation(({ ctx, input }) => mettreAJourConfigRelances(repo, ctx.tenant, input)),
  });
}
