import type { IFactureRepository } from "./application/facture-repository";
import type { IDevisReader } from "./application/devis-reader";
import { createFacturesRouter } from "./interface/trpc/factures.router";

// Wiring DI du module factures : assemble le routeur tRPC à partir du repository + du lecteur de
// devis injectés (conversion devis→facture, cross-domaine sans couplage de modules).
export interface FacturesModuleDeps {
  readonly repository: IFactureRepository;
  readonly devisReader: IDevisReader;
}

export interface FacturesModule {
  readonly deps: FacturesModuleDeps;
  readonly router: ReturnType<typeof createFacturesRouter>;
}

export function createFacturesModule(deps: FacturesModuleDeps): FacturesModule {
  return { deps, router: createFacturesRouter(deps.repository, deps.devisReader) };
}
