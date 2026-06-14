import type { IRdvRepository } from "./application/rdv-repository";

// Wiring DI du module rdv-en-ligne. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface RdvEnLigneModuleDeps {
  readonly repository: IRdvRepository;
}

export interface RdvEnLigneModule {
  readonly deps: RdvEnLigneModuleDeps;
}

export function createRdvEnLigneModule(deps: RdvEnLigneModuleDeps): RdvEnLigneModule {
  return { deps };
}
