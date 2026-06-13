import type { ICongeRepository } from "./application/conge-repository";

// Wiring DI du module conges. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface CongesModuleDeps {
  readonly repository: ICongeRepository;
}

export interface CongesModule {
  readonly deps: CongesModuleDeps;
}

export function createCongesModule(deps: CongesModuleDeps): CongesModule {
  return { deps };
}
