import type { IPrevisionCARepository } from "./application/prevision-ca-repository";
import type { FacturesCAReader } from "./application/factures-ca-reader";
import { createPrevisionsCARouter } from "./interface/trpc/previsions-ca.router";

// Wiring DI du module previsions-ca : assemble le routeur tRPC (CRUD + forecasting) à partir du
// repository injecté + (optionnel) le reader CA factures pour `calculer` (sans lui, `calculer`
// renvoie le message « pas assez de données »).
export interface PrevisionsCAModuleDeps {
  readonly repository: IPrevisionCARepository;
  readonly facturesCAReader?: FacturesCAReader;
}

export interface PrevisionsCAModule {
  readonly deps: PrevisionsCAModuleDeps;
  readonly router: ReturnType<typeof createPrevisionsCARouter>;
}

export function createPrevisionsCAModule(deps: PrevisionsCAModuleDeps): PrevisionsCAModule {
  return { deps, router: createPrevisionsCARouter(deps.repository, deps.facturesCAReader) };
}
