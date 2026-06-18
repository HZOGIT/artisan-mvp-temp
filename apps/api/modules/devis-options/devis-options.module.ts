import type { IDevisOptionRepository } from "./application/devis-option-repository";
import { createDevisOptionsRouter } from "./interface/trpc/devis-options.router";

// Wiring DI du module « options de devis » (variantes) : assemble le routeur tRPC à partir du
// repository injecté.
export interface DevisOptionsModuleDeps {
  readonly repository: IDevisOptionRepository;
}

export interface DevisOptionsModule {
  readonly deps: DevisOptionsModuleDeps;
  readonly router: ReturnType<typeof createDevisOptionsRouter>;
}

export function createDevisOptionsModule(deps: DevisOptionsModuleDeps): DevisOptionsModule {
  return { deps, router: createDevisOptionsRouter(deps.repository) };
}
