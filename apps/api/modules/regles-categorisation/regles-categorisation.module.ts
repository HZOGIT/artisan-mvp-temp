import type { IRegleCategorisationRepository } from "./application/regle-categorisation-repository";
import { createReglesCategorisationRouter } from "./interface/trpc/regles-categorisation.router";

/*
 * Wiring DI du module regles-categorisation : assemble le routeur tRPC (CRUD catalogue) à partir du
 * repository injecté.
 */
export interface ReglesCategorisationModuleDeps {
  readonly repository: IRegleCategorisationRepository;
}

export interface ReglesCategorisationModule {
  readonly deps: ReglesCategorisationModuleDeps;
  readonly router: ReturnType<typeof createReglesCategorisationRouter>;
}

export function createReglesCategorisationModule(deps: ReglesCategorisationModuleDeps): ReglesCategorisationModule {
  return { deps, router: createReglesCategorisationRouter(deps.repository) };
}
