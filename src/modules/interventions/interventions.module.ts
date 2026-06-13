import type { IInterventionRepository } from "./application/intervention-repository";
import { createInterventionsRouter } from "./interface/trpc/interventions.router";

// Wiring DI du module interventions : assemble le routeur tRPC à partir du repository injecté.
export interface InterventionsModuleDeps {
  readonly repository: IInterventionRepository;
}

export interface InterventionsModule {
  readonly deps: InterventionsModuleDeps;
  readonly router: ReturnType<typeof createInterventionsRouter>;
}

export function createInterventionsModule(deps: InterventionsModuleDeps): InterventionsModule {
  return { deps, router: createInterventionsRouter(deps.repository) };
}
