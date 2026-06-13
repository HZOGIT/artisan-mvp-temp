import type { IFactureRepository } from "./application/facture-repository";
import { createFacturesRouter } from "./interface/trpc/factures.router";

// Wiring DI du module factures : assemble le routeur tRPC à partir du repository injecté.
export interface FacturesModuleDeps {
  readonly repository: IFactureRepository;
}

export interface FacturesModule {
  readonly deps: FacturesModuleDeps;
  readonly router: ReturnType<typeof createFacturesRouter>;
}

export function createFacturesModule(deps: FacturesModuleDeps): FacturesModule {
  return { deps, router: createFacturesRouter(deps.repository) };
}
