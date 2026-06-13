import type { IAvisRepository } from "./application/avis-repository";

// Wiring DI du module avis (use-cases + router assemblés aux étapes suivantes du gabarit).
export interface AvisModuleDeps {
  readonly repository: IAvisRepository;
}

export interface AvisModule {
  readonly deps: AvisModuleDeps;
}

export function createAvisModule(deps: AvisModuleDeps): AvisModule {
  return { deps };
}
