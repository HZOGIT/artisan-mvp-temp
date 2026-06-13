import type { IDepenseRepository } from "./application/depense-repository";

// Wiring DI du module depenses. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface DepensesModuleDeps {
  readonly repository: IDepenseRepository;
}

export interface DepensesModule {
  readonly deps: DepensesModuleDeps;
}

export function createDepensesModule(deps: DepensesModuleDeps): DepensesModule {
  return { deps };
}
