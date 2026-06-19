import type { IConfigRelancesRepository } from "./application/config-relances-repository";
import { createConfigRelancesRouter } from "./interface/trpc/config-relances.router";

/*
 * Wiring DI du module config-relances : assemble le routeur tRPC (get/update) à partir du
 * repository injecté (configuration des relances auto, singleton par tenant).
 */
export interface ConfigRelancesModuleDeps {
  readonly repository: IConfigRelancesRepository;
}

export interface ConfigRelancesModule {
  readonly deps: ConfigRelancesModuleDeps;
  readonly router: ReturnType<typeof createConfigRelancesRouter>;
}

export function createConfigRelancesModule(deps: ConfigRelancesModuleDeps): ConfigRelancesModule {
  return { deps, router: createConfigRelancesRouter(deps.repository) };
}
