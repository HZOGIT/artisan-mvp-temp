import type { IStockRepository } from "./application/stock-repository";

// Wiring DI du module stocks. Use-cases et adapter tRPC assemblés aux étapes suivantes
// du gabarit ; ici la forme des dépendances + le factory squelette.
export interface StocksModuleDeps {
  readonly repository: IStockRepository;
}

export interface StocksModule {
  readonly deps: StocksModuleDeps;
}

export function createStocksModule(deps: StocksModuleDeps): StocksModule {
  return { deps };
}
