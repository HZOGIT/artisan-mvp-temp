import type { IDemandeContactRepository } from "./application/demande-contact-repository";

// Wiring DI du module demandes-contact. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface DemandesContactModuleDeps {
  readonly repository: IDemandeContactRepository;
}

export interface DemandesContactModule {
  readonly deps: DemandesContactModuleDeps;
}

export function createDemandesContactModule(deps: DemandesContactModuleDeps): DemandesContactModule {
  return { deps };
}
