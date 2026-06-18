import type { IStockRepository } from "./application/stock-repository";
import type { INotificationRepository } from "../notifications/application/notification-repository";
import type { IFournisseurRepository } from "../fournisseurs/application/fournisseur-repository";
import { createStocksRouter } from "./interface/trpc/stocks.router";

// Wiring DI du module stocks : assemble le routeur tRPC à partir du repository injecté.
// Découple `app.ts`/`createAppRouter` des détails d'instanciation. Repos composés :
// `notificationRepository` (generateAlerts → notifications « Stock bas »), `fournisseurRepository`
// (getRapportCommande → réappro croisé avec les associations article↔fournisseur).
export interface StocksModuleDeps {
  readonly repository: IStockRepository;
  readonly notificationRepository: INotificationRepository;
  readonly fournisseurRepository: IFournisseurRepository;
}

export interface StocksModule {
  readonly deps: StocksModuleDeps;
  readonly router: ReturnType<typeof createStocksRouter>;
}

export function createStocksModule(deps: StocksModuleDeps): StocksModule {
  return {
    deps,
    router: createStocksRouter(deps.repository, deps.notificationRepository, deps.fournisseurRepository),
  };
}
