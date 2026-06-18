import type { IChantierRepository } from "./application/chantier-repository";
import { createChantiersRouter } from "./interface/trpc/chantiers.router";

// Wiring DI du module chantiers : assemble le routeur tRPC à partir du repository injecté.
export interface ChantiersModuleDeps {
  readonly repository: IChantierRepository;
}

export interface ChantiersModule {
  readonly deps: ChantiersModuleDeps;
  readonly router: ReturnType<typeof createChantiersRouter>;
}

export function createChantiersModule(deps: ChantiersModuleDeps): ChantiersModule {
  return { deps, router: createChantiersRouter(deps.repository) };
}
