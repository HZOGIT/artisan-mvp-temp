import type { InterventionsMobileDeps } from "./application/use-cases";
import { createInterventionsMobileRouter } from "./interface/trpc/interventions-mobile.router";

/*
 * Wiring DI du module « interventionsMobile » (app mobile technicien). Compose les ports migrés
 * interventions/clients/techniciens + le repo dédié `interventions_mobile`.
 */
export interface InterventionsMobileModuleDeps extends InterventionsMobileDeps {}

export interface InterventionsMobileModule {
  readonly deps: InterventionsMobileModuleDeps;
  readonly router: ReturnType<typeof createInterventionsMobileRouter>;
}

export function createInterventionsMobileModule(deps: InterventionsMobileModuleDeps): InterventionsMobileModule {
  return { deps, router: createInterventionsMobileRouter(deps) };
}
