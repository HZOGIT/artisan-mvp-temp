import { router, publicProcedure, protectedProcedure } from "./trpc";
import { createVehiculesRouter } from "../../modules/vehicules/interface/trpc/vehicules.router";
import type { IVehiculeRepository } from "../../modules/vehicules/application/vehicule-repository";

export interface AppRouterDeps {
  readonly vehiculeRepo: IVehiculeRepository;
}

// Routeur racine du nouveau stack. Les routeurs de domaines (phases 1-5) y sont montés
// au fur et à mesure, derrière le gateway/flag. `whoami` démontre `protectedProcedure`.
export function createAppRouter(deps: AppRouterDeps) {
  return router({
    health: publicProcedure.query(() => ({ status: "ok" as const })),
    whoami: protectedProcedure.query(({ ctx }) => ({
      artisanId: ctx.tenant.artisanId,
      userId: ctx.tenant.userId,
      role: ctx.tenant.role ?? null,
    })),
    vehicules: createVehiculesRouter(deps.vehiculeRepo),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
