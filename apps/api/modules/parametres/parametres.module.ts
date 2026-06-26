import type { DbClient } from "../../shared/db";
import type { IParametresRepository } from "./application/parametres-repository";
import { createParametresRouter } from "./interface/trpc/parametres.router";

/*
 * Wiring DI du module parametres : assemble le routeur tRPC (get/update) à partir du repository
 * injecté (configuration artisan, singleton par tenant).
 */
export interface ParametresModuleDeps {
  readonly repository: IParametresRepository;
  readonly db?: DbClient;
}

export interface ParametresModule {
  readonly deps: ParametresModuleDeps;
  readonly router: ReturnType<typeof createParametresRouter>;
}

export function createParametresModule(deps: ParametresModuleDeps): ParametresModule {
  return { deps, router: createParametresRouter(deps.repository, deps.db) };
}
