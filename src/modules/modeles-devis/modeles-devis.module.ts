import type { IModeleDevisRepository } from "./application/modele-devis-repository";

// Wiring DI du module modeles-devis. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface ModelesDevisModuleDeps {
  readonly repository: IModeleDevisRepository;
}

export interface ModelesDevisModule {
  readonly deps: ModelesDevisModuleDeps;
}

export function createModelesDevisModule(deps: ModelesDevisModuleDeps): ModelesDevisModule {
  return { deps };
}
