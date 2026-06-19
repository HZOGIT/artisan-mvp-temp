import type { IAlertesPrevisionsRepository } from "./application/alertes-previsions-repository";
import { createAlertesPrevisionsRouter } from "./interface/trpc/alertes-previsions.router";

/** Wiring DI du module « alertesPrevisions » (alertes du prévisionnel de trésorerie, tables sous RLS). */
export interface AlertesPrevisionsModuleDeps {
  readonly repo: IAlertesPrevisionsRepository;
}

export interface AlertesPrevisionsModule {
  readonly deps: AlertesPrevisionsModuleDeps;
  readonly router: ReturnType<typeof createAlertesPrevisionsRouter>;
}

export function createAlertesPrevisionsModule(deps: AlertesPrevisionsModuleDeps): AlertesPrevisionsModule {
  return { deps, router: createAlertesPrevisionsRouter(deps.repo) };
}
