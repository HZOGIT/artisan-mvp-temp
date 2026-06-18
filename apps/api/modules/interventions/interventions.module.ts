import type { IInterventionRepository } from "./application/intervention-repository";
import type { ICongeRepository } from "../conges/application/conge-repository";
import type { ITechnicienRepository } from "../techniciens/application/technicien-repository";
import { createInterventionsRouter } from "./interface/trpc/interventions.router";

// Wiring DI du module interventions : repository injecté + repo congés (`assignerTechnicien` :
// conflits d'agenda) + repo techniciens (`getSuggestionsTechniciens` : positions/dispo, scopé tenant).
export interface InterventionsModuleDeps {
  readonly repository: IInterventionRepository;
  readonly congeRepository: ICongeRepository;
  readonly technicienRepository: ITechnicienRepository;
}

export interface InterventionsModule {
  readonly deps: InterventionsModuleDeps;
  readonly router: ReturnType<typeof createInterventionsRouter>;
}

export function createInterventionsModule(deps: InterventionsModuleDeps): InterventionsModule {
  return { deps, router: createInterventionsRouter(deps.repository, deps.congeRepository, deps.technicienRepository) };
}
