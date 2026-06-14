import type { IConfigRelancesRepository } from "./application/config-relances-repository";

// Wiring DI du module config-relances. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC (get/update) sera assemblé et exposé à l'étape interface (5/9).
export interface ConfigRelancesModuleDeps {
  readonly repository: IConfigRelancesRepository;
}

export interface ConfigRelancesModule {
  readonly deps: ConfigRelancesModuleDeps;
}

export function createConfigRelancesModule(deps: ConfigRelancesModuleDeps): ConfigRelancesModule {
  return { deps };
}
