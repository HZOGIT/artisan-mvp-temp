import type { DbClient } from "../../shared/db";
import type { ICongeRepository } from "./application/conge-repository";
import { createCongesRouter } from "./interface/trpc/conges.router";

/** Wiring DI du module conges : assemble le routeur tRPC à partir du repository injecté. */
export interface CongesModuleDeps {
  readonly repository: ICongeRepository;
  readonly db?: DbClient;
}

export interface CongesModule {
  readonly deps: CongesModuleDeps;
  readonly router: ReturnType<typeof createCongesRouter>;
}

export function createCongesModule(deps: CongesModuleDeps): CongesModule {
  return { deps, router: createCongesRouter(deps.repository, deps.db) };
}
