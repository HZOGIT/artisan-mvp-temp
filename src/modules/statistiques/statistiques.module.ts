import type { IDevisStatsReader } from "./application/devis-stats-reader";
import { createStatistiquesRouter } from "./interface/trpc/statistiques.router";

// Wiring DI du module « statistiques » (lectures agrégées).
export interface StatistiquesModuleDeps {
  readonly devisStatsReader: IDevisStatsReader;
}

export interface StatistiquesModule {
  readonly deps: StatistiquesModuleDeps;
  readonly router: ReturnType<typeof createStatistiquesRouter>;
}

export function createStatistiquesModule(deps: StatistiquesModuleDeps): StatistiquesModule {
  return { deps, router: createStatistiquesRouter(deps.devisStatsReader) };
}
