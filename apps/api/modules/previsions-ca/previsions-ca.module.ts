import type { DbClient } from "../../shared/db";
import type { IPrevisionCARepository } from "./application/prevision-ca-repository";
import type { FacturesCAReader } from "./application/factures-ca-reader";
import type { TresorerieReader } from "./application/tresorerie-reader";
import { createPrevisionsCARouter } from "./interface/trpc/previsions-ca.router";

/*
 * Wiring DI du module previsions-ca : assemble le routeur tRPC (CRUD + forecasting) à partir du
 * repository injecté + (optionnels) le reader CA factures pour `calculer` + le reader trésorerie
 * pour `getTresoreriePrevisionnelle` (sans eux : message « pas assez de données » / trésorerie vide).
 */
export interface PrevisionsCAModuleDeps {
  readonly repository: IPrevisionCARepository;
  readonly facturesCAReader?: FacturesCAReader;
  readonly tresorerieReader?: TresorerieReader;
  readonly db?: DbClient;
}

export interface PrevisionsCAModule {
  readonly deps: PrevisionsCAModuleDeps;
  readonly router: ReturnType<typeof createPrevisionsCARouter>;
}

export function createPrevisionsCAModule(deps: PrevisionsCAModuleDeps): PrevisionsCAModule {
  return { deps, router: createPrevisionsCARouter(deps.repository, deps.facturesCAReader, deps.tresorerieReader, deps.db) };
}
