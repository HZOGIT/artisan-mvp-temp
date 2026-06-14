import type { IEcritureRepository } from "./application/ecriture-repository";

// Wiring DI du module ecritures. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC (lecture : journal/balance/grand-livre/export FEC) sera assemblé à l'étape
// interface (5/9). La génération des écritures (vente/encaissement) branchera le `ComptaPort`
// des factures sur ce module.
export interface EcrituresModuleDeps {
  readonly repository: IEcritureRepository;
}

export interface EcrituresModule {
  readonly deps: EcrituresModuleDeps;
}

export function createEcrituresModule(deps: EcrituresModuleDeps): EcrituresModule {
  return { deps };
}
