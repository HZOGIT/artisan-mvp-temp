import type { IRelanceDevisRepository } from "./application/relance-devis-repository";

// Wiring DI du module relances-devis. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface RelancesDevisModuleDeps {
  readonly repository: IRelanceDevisRepository;
}

export interface RelancesDevisModule {
  readonly deps: RelancesDevisModuleDeps;
}

export function createRelancesDevisModule(deps: RelancesDevisModuleDeps): RelancesDevisModule {
  return { deps };
}
