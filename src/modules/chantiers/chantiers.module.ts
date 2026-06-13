import type { IChantierRepository } from "./application/chantier-repository";

// Wiring DI du module chantiers. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface ChantiersModuleDeps {
  readonly repository: IChantierRepository;
}

export interface ChantiersModule {
  readonly deps: ChantiersModuleDeps;
}

export function createChantiersModule(deps: ChantiersModuleDeps): ChantiersModule {
  return { deps };
}
