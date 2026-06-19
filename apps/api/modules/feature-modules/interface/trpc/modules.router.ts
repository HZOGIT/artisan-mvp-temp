import { z } from "zod";
import { router, protectedProcedure } from "../../../../interface/trpc/trpc";
import type { IModulesRepository } from "../../application/modules-repository";
import {
  completeOnboarding,
  getMine,
  getOnboardingStatus,
  listModules,
  skipOnboarding,
  toggleModule,
} from "../../application/use-cases";

/*
 * Routeur tRPC des modules (catalogue + activation par artisan + onboarding). Surface client :
 * list/getMine/getOnboardingStatus/toggle/completeOnboarding/skipOnboarding. Domain errors → 404/403.
 */
export function createModulesRouter(repo: IModulesRepository) {
  return router({
    list: protectedProcedure.query(({ ctx }) => listModules(repo, ctx.tenant)),

    getMine: protectedProcedure.query(({ ctx }) => getMine(repo, ctx.tenant)),

    getOnboardingStatus: protectedProcedure.query(({ ctx }) => getOnboardingStatus(repo, ctx.tenant)),

    toggle: protectedProcedure
      .input(z.object({ slug: z.string().max(50), actif: z.boolean() }))
      .mutation(({ ctx, input }) => toggleModule(repo, ctx.tenant, input.slug, input.actif)),

    completeOnboarding: protectedProcedure
      .input(
        z.object({
          metier: z.string().max(100).optional(),
          plan: z.string().max(20).optional(),
          // Borne defense-in-depth (parcouru via Set.has pour chaque module du catalogue).
          moduleSlugs: z.array(z.string().max(100)).max(200).optional(),
        }),
      )
      .mutation(({ ctx, input }) => completeOnboarding(repo, ctx.tenant, input)),

    skipOnboarding: protectedProcedure.mutation(({ ctx }) => skipOnboarding(repo, ctx.tenant)),
  });
}
