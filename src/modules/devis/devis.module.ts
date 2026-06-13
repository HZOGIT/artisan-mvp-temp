import type { IDevisRepository } from "./application/devis-repository";
import { createDevisRouter } from "./interface/trpc/devis.router";

// Wiring DI du module devis : assemble le routeur tRPC à partir du repository injecté.
export interface DevisModuleDeps {
  readonly repository: IDevisRepository;
}

export interface DevisModule {
  readonly deps: DevisModuleDeps;
  readonly router: ReturnType<typeof createDevisRouter>;
}

export function createDevisModule(deps: DevisModuleDeps): DevisModule {
  return { deps, router: createDevisRouter(deps.repository) };
}
