import type { IFactureRepository } from "./application/facture-repository";

// Wiring DI du module factures. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface FacturesModuleDeps {
  readonly repository: IFactureRepository;
}

export interface FacturesModule {
  readonly deps: FacturesModuleDeps;
}

export function createFacturesModule(deps: FacturesModuleDeps): FacturesModule {
  return { deps };
}
