import type { IStockRepository } from "./application/stock-repository";
import { createStocksRouter } from "./interface/trpc/stocks.router";

// Wiring DI du module stocks : assemble le routeur tRPC à partir du repository injecté.
// Découple `app.ts`/`createAppRouter` des détails d'instanciation.
export interface StocksModuleDeps {
  readonly repository: IStockRepository;
}

export interface StocksModule {
  readonly deps: StocksModuleDeps;
  readonly router: ReturnType<typeof createStocksRouter>;
}

export function createStocksModule(deps: StocksModuleDeps): StocksModule {
  return { deps, router: createStocksRouter(deps.repository) };
}
