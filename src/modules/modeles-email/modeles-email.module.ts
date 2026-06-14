import type { IModeleEmailRepository } from "./application/modele-email-repository";

// Wiring DI du module modeles-email. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface ModelesEmailModuleDeps {
  readonly repository: IModeleEmailRepository;
}

export interface ModelesEmailModule {
  readonly deps: ModelesEmailModuleDeps;
}

export function createModelesEmailModule(deps: ModelesEmailModuleDeps): ModelesEmailModule {
  return { deps };
}
