import type { IModeleDevisRepository } from "./application/modele-devis-repository";
import { createModelesDevisRouter } from "./interface/trpc/modeles-devis.router";

// Wiring DI du module modeles-devis : assemble le routeur tRPC (CRUD agrégat) à partir du
// repository injecté.
export interface ModelesDevisModuleDeps {
  readonly repository: IModeleDevisRepository;
}

export interface ModelesDevisModule {
  readonly deps: ModelesDevisModuleDeps;
  readonly router: ReturnType<typeof createModelesDevisRouter>;
}

export function createModelesDevisModule(deps: ModelesDevisModuleDeps): ModelesDevisModule {
  return { deps, router: createModelesDevisRouter(deps.repository) };
}
