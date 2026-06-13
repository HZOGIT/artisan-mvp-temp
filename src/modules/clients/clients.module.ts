import type { IClientRepository } from "./application/client-repository";

// Wiring DI du module clients. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9), comme pour les modules
// précédents.
export interface ClientsModuleDeps {
  readonly repository: IClientRepository;
}

export interface ClientsModule {
  readonly deps: ClientsModuleDeps;
}

export function createClientsModule(deps: ClientsModuleDeps): ClientsModule {
  return { deps };
}
