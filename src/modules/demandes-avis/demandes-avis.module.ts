import type { IDemandeAvisRepository } from "./application/demande-avis-repository";

// Wiring DI du module demandes-avis. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface DemandesAvisModuleDeps {
  readonly repository: IDemandeAvisRepository;
}

export interface DemandesAvisModule {
  readonly deps: DemandesAvisModuleDeps;
}

export function createDemandesAvisModule(deps: DemandesAvisModuleDeps): DemandesAvisModule {
  return { deps };
}
