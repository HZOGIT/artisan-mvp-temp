import type { IEcritureRepository } from "./application/ecriture-repository";
import { createEcrituresRouter } from "./interface/trpc/ecritures.router";

/*
 * Wiring DI du module ecritures : assemble le routeur tRPC (lecture seule : list/byFacture/
 * balance/grand-livre/export FEC) à partir du repository injecté. La génération des écritures
 * (vente/encaissement) branche le `ComptaPort` des factures sur ce module (cf. adapter).
 */
export interface EcrituresModuleDeps {
  readonly repository: IEcritureRepository;
}

export interface EcrituresModule {
  readonly deps: EcrituresModuleDeps;
  readonly router: ReturnType<typeof createEcrituresRouter>;
}

export function createEcrituresModule(deps: EcrituresModuleDeps): EcrituresModule {
  return { deps, router: createEcrituresRouter(deps.repository) };
}
