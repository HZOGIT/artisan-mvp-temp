import type { ITechnicienRepository } from "./application/technicien-repository";

// Wiring DI du module techniciens. Use-cases et adapter tRPC assemblés aux étapes
// suivantes du gabarit ; ici la forme des dépendances + le factory squelette.
export interface TechniciensModuleDeps {
  readonly repository: ITechnicienRepository;
}

export interface TechniciensModule {
  readonly deps: TechniciensModuleDeps;
}

export function createTechniciensModule(deps: TechniciensModuleDeps): TechniciensModule {
  return { deps };
}
