import type { IRdvRepository } from "./application/rdv-repository";
import type { IInterventionRepository } from "../interventions/application/intervention-repository";
import type { IClientRepository } from "../clients/application/client-repository";
import { createRdvEnLigneRouter } from "./interface/trpc/rdv-en-ligne.router";

// Wiring DI du module rdv-en-ligne : assemble le routeur tRPC à partir du repository injecté. Repos
// composés : `interventionRepository` (`confirm` crée une intervention) + `clientRepository`
// (`list` enrichit chaque RDV de son client — le client UI lit `rdv.client`).
export interface RdvEnLigneModuleDeps {
  readonly repository: IRdvRepository;
  readonly interventionRepository: IInterventionRepository;
  readonly clientRepository: IClientRepository;
}

export interface RdvEnLigneModule {
  readonly deps: RdvEnLigneModuleDeps;
  readonly router: ReturnType<typeof createRdvEnLigneRouter>;
}

export function createRdvEnLigneModule(deps: RdvEnLigneModuleDeps): RdvEnLigneModule {
  return {
    deps,
    router: createRdvEnLigneRouter(deps.repository, deps.interventionRepository, deps.clientRepository),
  };
}
