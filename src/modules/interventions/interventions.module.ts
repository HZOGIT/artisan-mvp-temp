import type { IInterventionRepository } from "./application/intervention-repository";

// Wiring DI du module interventions. À l'étape scaffold, le module ne porte que ses
// dépendances ; le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface InterventionsModuleDeps {
  readonly repository: IInterventionRepository;
}

export interface InterventionsModule {
  readonly deps: InterventionsModuleDeps;
}

export function createInterventionsModule(deps: InterventionsModuleDeps): InterventionsModule {
  return { deps };
}
