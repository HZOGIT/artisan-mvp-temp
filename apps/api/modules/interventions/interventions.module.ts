import type { DbClient } from "../../shared/db";
import type { IInterventionRepository } from "./application/intervention-repository";
import type { ICongeRepository } from "../conges/application/conge-repository";
import type { ITechnicienRepository } from "../techniciens/application/technicien-repository";
import type { IBadgeRepository } from "../badges/application/badge-repository";
import { createInterventionsRouter } from "./interface/trpc/interventions.router";

/*
 * Wiring DI du module interventions : repository injecté + repo congés (`assignerTechnicien` :
 * conflits d'agenda) + repo techniciens (`getSuggestionsTechniciens` : positions/dispo, scopé tenant)
 * + repo badges (`verifierBadges` fire-and-forget à la clôture → terminee).
 */
export interface InterventionsModuleDeps {
  readonly repository: IInterventionRepository;
  readonly congeRepository: ICongeRepository;
  readonly technicienRepository: ITechnicienRepository;
  readonly badgeRepository: IBadgeRepository;
  readonly db?: DbClient;
}

export interface InterventionsModule {
  readonly deps: InterventionsModuleDeps;
  readonly router: ReturnType<typeof createInterventionsRouter>;
}

export function createInterventionsModule(deps: InterventionsModuleDeps): InterventionsModule {
  return { deps, router: createInterventionsRouter(deps.repository, deps.congeRepository, deps.technicienRepository, deps.badgeRepository, deps.db) };
}
