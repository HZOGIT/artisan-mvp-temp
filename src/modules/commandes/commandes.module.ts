import type { ICommandeRepository } from "./application/commande-repository";

// Wiring DI du module commandes. Use-cases et adapter tRPC assemblés aux étapes suivantes
// du gabarit ; ici la forme des dépendances + le factory squelette.
export interface CommandesModuleDeps {
  readonly repository: ICommandeRepository;
}

export interface CommandesModule {
  readonly deps: CommandesModuleDeps;
}

export function createCommandesModule(deps: CommandesModuleDeps): CommandesModule {
  return { deps };
}
