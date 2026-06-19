import type { IRapportRepository } from "./application/rapport-repository";
import { createRapportsRouter } from "./interface/trpc/rapports.router";

/** Wiring DI du module « rapports » (rapports personnalisables + exécution). */
export interface RapportsModuleDeps {
  readonly repository: IRapportRepository;
}

export interface RapportsModule {
  readonly deps: RapportsModuleDeps;
  readonly router: ReturnType<typeof createRapportsRouter>;
}

export function createRapportsModule(deps: RapportsModuleDeps): RapportsModule {
  return { deps, router: createRapportsRouter(deps.repository) };
}
