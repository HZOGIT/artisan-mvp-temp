import type { IBadgeRepository } from "./application/badge-repository";

// Wiring DI du module badges. Les use-cases et l'adapter tRPC sont assemblés aux étapes
// suivantes du gabarit ; ici la forme des dépendances + le factory squelette.
export interface BadgesModuleDeps {
  readonly repository: IBadgeRepository;
}

export interface BadgesModule {
  readonly deps: BadgesModuleDeps;
}

export function createBadgesModule(deps: BadgesModuleDeps): BadgesModule {
  return { deps };
}
