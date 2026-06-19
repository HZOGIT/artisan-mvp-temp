import type { IDashboardReader } from "./application/dashboard-reader";
import { createDashboardRouter } from "./interface/trpc/dashboard.router";

/** Wiring DI du module « dashboard » (agrégats de lecture). */
export interface DashboardModuleDeps {
  readonly reader: IDashboardReader;
}

export interface DashboardModule {
  readonly deps: DashboardModuleDeps;
  readonly router: ReturnType<typeof createDashboardRouter>;
}

export function createDashboardModule(deps: DashboardModuleDeps): DashboardModule {
  return { deps, router: createDashboardRouter(deps.reader) };
}
