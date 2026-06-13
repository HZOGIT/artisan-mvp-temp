import type { IDevisRepository } from "./application/devis-repository";

// Wiring DI du module devis. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface DevisModuleDeps {
  readonly repository: IDevisRepository;
}

export interface DevisModule {
  readonly deps: DevisModuleDeps;
}

export function createDevisModule(deps: DevisModuleDeps): DevisModule {
  return { deps };
}
