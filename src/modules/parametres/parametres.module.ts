import type { IParametresRepository } from "./application/parametres-repository";

// Wiring DI du module parametres. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC (get/upsert) sera assemblé et exposé à l'étape interface (5/9).
export interface ParametresModuleDeps {
  readonly repository: IParametresRepository;
}

export interface ParametresModule {
  readonly deps: ParametresModuleDeps;
}

export function createParametresModule(deps: ParametresModuleDeps): ParametresModule {
  return { deps };
}
