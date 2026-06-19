import type { ITechnicienRepository } from "./application/technicien-repository";
import { createTechniciensRouter } from "./interface/trpc/techniciens.router";

/*
 * Wiring DI du module techniciens : assemble le routeur tRPC à partir du repository
 * injecté. Découple `app.ts`/`createAppRouter` des détails d'instanciation.
 */
export interface TechniciensModuleDeps {
  readonly repository: ITechnicienRepository;
}

export interface TechniciensModule {
  readonly deps: TechniciensModuleDeps;
  readonly router: ReturnType<typeof createTechniciensRouter>;
}

export function createTechniciensModule(deps: TechniciensModuleDeps): TechniciensModule {
  return { deps, router: createTechniciensRouter(deps.repository) };
}
