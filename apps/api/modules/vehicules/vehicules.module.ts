import type { IVehiculeRepository } from "./application/vehicule-repository";

/*
 * Wiring DI du module vehicules. Les use-cases et l'adapter tRPC (étapes suivantes du
 * gabarit) seront assemblés ici à partir des dépendances injectées (repo, ports d'effets).
 * Pour l'instant : la forme des dépendances + un factory squelette.
 */
export interface VehiculesModuleDeps {
  readonly repository: IVehiculeRepository;
}

export interface VehiculesModule {
  readonly deps: VehiculesModuleDeps;
}

export function createVehiculesModule(deps: VehiculesModuleDeps): VehiculesModule {
  return { deps };
}
