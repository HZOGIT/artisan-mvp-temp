import type { IFournisseurRepository } from "./application/fournisseur-repository";

// Wiring DI du module fournisseurs. Use-cases et adapter tRPC assemblés aux étapes
// suivantes du gabarit ; ici la forme des dépendances + le factory squelette.
export interface FournisseursModuleDeps {
  readonly repository: IFournisseurRepository;
}

export interface FournisseursModule {
  readonly deps: FournisseursModuleDeps;
}

export function createFournisseursModule(deps: FournisseursModuleDeps): FournisseursModule {
  return { deps };
}
