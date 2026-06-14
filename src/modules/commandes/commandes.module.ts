import type { ICommandeRepository } from "./application/commande-repository";
import type { IFournisseurRepository } from "../fournisseurs/application/fournisseur-repository";
import { createCommandesRouter } from "./interface/trpc/commandes.router";

// Wiring DI du module commandes : assemble le routeur tRPC à partir du repository injecté.
// `fournisseurRepository` est composé (getPerformances agrège commandes × fournisseurs).
export interface CommandesModuleDeps {
  readonly repository: ICommandeRepository;
  readonly fournisseurRepository: IFournisseurRepository;
}

export interface CommandesModule {
  readonly deps: CommandesModuleDeps;
  readonly router: ReturnType<typeof createCommandesRouter>;
}

export function createCommandesModule(deps: CommandesModuleDeps): CommandesModule {
  return { deps, router: createCommandesRouter(deps.repository, deps.fournisseurRepository) };
}
