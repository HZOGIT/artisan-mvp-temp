import type { IInterventionRepository } from "./application/intervention-repository";
import type { ICongeRepository } from "../conges/application/conge-repository";
import { createInterventionsRouter } from "./interface/trpc/interventions.router";

// Wiring DI du module interventions : assemble le routeur tRPC à partir du repository injecté + du
// repo congés (composé par `assignerTechnicien` pour la détection de conflits d'agenda).
export interface InterventionsModuleDeps {
  readonly repository: IInterventionRepository;
  readonly congeRepository: ICongeRepository;
}

export interface InterventionsModule {
  readonly deps: InterventionsModuleDeps;
  readonly router: ReturnType<typeof createInterventionsRouter>;
}

export function createInterventionsModule(deps: InterventionsModuleDeps): InterventionsModule {
  return { deps, router: createInterventionsRouter(deps.repository, deps.congeRepository) };
}
