import { router, publicProcedure, protectedProcedure } from "./trpc";
import { createVehiculesRouter } from "../../modules/vehicules/interface/trpc/vehicules.router";
import type { IVehiculeRepository } from "../../modules/vehicules/application/vehicule-repository";
import { createAvisRouter } from "../../modules/avis/interface/trpc/avis.router";
import type { IAvisRepository } from "../../modules/avis/application/avis-repository";
import type { DemandeAvisDeps } from "../../modules/avis/application/demande-avis-use-cases";

export interface AppRouterDeps {
  readonly vehiculeRepo: IVehiculeRepository;
  readonly avisRepo: IAvisRepository;
  readonly demandeAvisDeps: DemandeAvisDeps;
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
    avis: createAvisRouter(deps.avisRepo, deps.demandeAvisDeps),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
