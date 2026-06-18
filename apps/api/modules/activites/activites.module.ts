import type { IActiviteRepository } from "./application/activite-repository";
import { createActivitesRouter } from "./interface/trpc/activites.router";

// Wiring DI du module « activités » (suivi commercial) : assemble le routeur tRPC à partir du
// repository injecté.
export interface ActivitesModuleDeps {
  readonly repository: IActiviteRepository;
}

export interface ActivitesModule {
  readonly deps: ActivitesModuleDeps;
  readonly router: ReturnType<typeof createActivitesRouter>;
}

export function createActivitesModule(deps: ActivitesModuleDeps): ActivitesModule {
  return { deps, router: createActivitesRouter(deps.repository) };
}
