import type { IStockRepository } from "./application/stock-repository";
import type { INotificationRepository } from "../notifications/application/notification-repository";
import { createStocksRouter } from "./interface/trpc/stocks.router";

// Wiring DI du module stocks : assemble le routeur tRPC à partir du repository injecté.
// Découple `app.ts`/`createAppRouter` des détails d'instanciation. `notificationRepository` est
// composé (generateAlerts crée des notifications « Stock bas » via le domaine notifications).
export interface StocksModuleDeps {
  readonly repository: IStockRepository;
  readonly notificationRepository: INotificationRepository;
}

export interface StocksModule {
  readonly deps: StocksModuleDeps;
  readonly router: ReturnType<typeof createStocksRouter>;
}

export function createStocksModule(deps: StocksModuleDeps): StocksModule {
  return { deps, router: createStocksRouter(deps.repository, deps.notificationRepository) };
}
