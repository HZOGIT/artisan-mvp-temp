import type { IRdvRepository } from "./application/rdv-repository";
import { createRdvEnLigneRouter } from "./interface/trpc/rdv-en-ligne.router";

// Wiring DI du module rdv-en-ligne : assemble le routeur tRPC (CRUD) à partir du repository injecté.
// ⚠️ Les transitions de statut (confirmer/refuser/annuler) seront ajoutées au routeur en 7/9.
export interface RdvEnLigneModuleDeps {
  readonly repository: IRdvRepository;
}

export interface RdvEnLigneModule {
  readonly deps: RdvEnLigneModuleDeps;
  readonly router: ReturnType<typeof createRdvEnLigneRouter>;
}

export function createRdvEnLigneModule(deps: RdvEnLigneModuleDeps): RdvEnLigneModule {
  return { deps, router: createRdvEnLigneRouter(deps.repository) };
}
