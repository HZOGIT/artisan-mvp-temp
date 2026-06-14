import type { IRegleCategorisationRepository } from "./application/regle-categorisation-repository";

// Wiring DI du module regles-categorisation. À l'étape scaffold, le module ne porte que ses
// dépendances ; le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface ReglesCategorisationModuleDeps {
  readonly repository: IRegleCategorisationRepository;
}

export interface ReglesCategorisationModule {
  readonly deps: ReglesCategorisationModuleDeps;
}

export function createReglesCategorisationModule(deps: ReglesCategorisationModuleDeps): ReglesCategorisationModule {
  return { deps };
}
