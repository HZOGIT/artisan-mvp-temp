import type { ICommandeRepository } from "./application/commande-repository";
import { createCommandesRouter } from "./interface/trpc/commandes.router";

// Wiring DI du module commandes : assemble le routeur tRPC à partir du repository injecté.
// Découple `app.ts`/`createAppRouter` des détails d'instanciation.
export interface CommandesModuleDeps {
  readonly repository: ICommandeRepository;
}

export interface CommandesModule {
  readonly deps: CommandesModuleDeps;
  readonly router: ReturnType<typeof createCommandesRouter>;
}

export function createCommandesModule(deps: CommandesModuleDeps): CommandesModule {
  return { deps, router: createCommandesRouter(deps.repository) };
}
