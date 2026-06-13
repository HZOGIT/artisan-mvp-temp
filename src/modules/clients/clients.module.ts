import type { IClientRepository } from "./application/client-repository";
import { createClientsRouter } from "./interface/trpc/clients.router";

// Wiring DI du module clients : assemble le routeur tRPC à partir du repository injecté.
// Découple `app.ts`/`createAppRouter` des détails d'instanciation.
export interface ClientsModuleDeps {
  readonly repository: IClientRepository;
}

export interface ClientsModule {
  readonly deps: ClientsModuleDeps;
  readonly router: ReturnType<typeof createClientsRouter>;
}

export function createClientsModule(deps: ClientsModuleDeps): ClientsModule {
  return { deps, router: createClientsRouter(deps.repository) };
}
