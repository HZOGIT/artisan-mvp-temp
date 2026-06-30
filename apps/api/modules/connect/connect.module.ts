import type { IArtisanRepository } from "../artisan/application/artisan-repository";
import type { StripePort } from "../../shared/ports/stripe";
import type { DbClient } from "../../shared/db";
import { createConnectRouter } from "./interface/trpc/connect.router";
import { registerConnectRefreshRoute, type ConnectRefreshRouteDeps } from "./interface/http/connect-refresh-route";

export interface ConnectModuleDeps {
  readonly artisanRepo: IArtisanRepository;
  readonly stripe: StripePort;
  readonly db: DbClient;
  readonly appUrl: string;
}

export interface ConnectModule {
  readonly router: ReturnType<typeof createConnectRouter>;
  readonly routeDeps: ConnectRefreshRouteDeps;
  readonly registerRefreshRoute: typeof registerConnectRefreshRoute;
}

export function createConnectModule(deps: ConnectModuleDeps): ConnectModule {
  const connectDeps = { artisanRepo: deps.artisanRepo, stripe: deps.stripe, appUrl: deps.appUrl };
  return {
    router: createConnectRouter(connectDeps),
    routeDeps: { stripe: deps.stripe, db: deps.db, appUrl: deps.appUrl },
    registerRefreshRoute: registerConnectRefreshRoute,
  };
}
