import type { DbClient } from "../../shared/db";
import type { IBadgeRepository } from "./application/badge-repository";
import { createBadgesRouter } from "./interface/trpc/badges.router";

/*
 * Wiring DI du module badges : assemble le routeur tRPC à partir du repository injecté.
 * Découple `app.ts`/`createAppRouter` des détails d'instanciation.
 */
export interface BadgesModuleDeps {
  readonly repository: IBadgeRepository;
  /** Pool DB pour les transactions outbox (défaut : getDbHandle().db). */
  readonly db?: DbClient;
}

export interface BadgesModule {
  readonly deps: BadgesModuleDeps;
  readonly router: ReturnType<typeof createBadgesRouter>;
}

export function createBadgesModule(deps: BadgesModuleDeps): BadgesModule {
  return { deps, router: createBadgesRouter(deps.repository, deps.db) };
}
