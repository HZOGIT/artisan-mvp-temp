import type { IRelanceDevisRepository } from "./application/relance-devis-repository";
import { createRelancesDevisRouter } from "./interface/trpc/relances-devis.router";

// Wiring DI du module relances-devis : assemble le routeur tRPC (journal append-only) à partir du
// repository injecté.
export interface RelancesDevisModuleDeps {
  readonly repository: IRelanceDevisRepository;
}

export interface RelancesDevisModule {
  readonly deps: RelancesDevisModuleDeps;
  readonly router: ReturnType<typeof createRelancesDevisRouter>;
}

export function createRelancesDevisModule(deps: RelancesDevisModuleDeps): RelancesDevisModule {
  return { deps, router: createRelancesDevisRouter(deps.repository) };
}
