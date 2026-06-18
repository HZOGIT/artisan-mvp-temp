import type { IComptabiliteReader } from "./application/comptabilite-reader";
import { createComptabiliteRouter } from "./interface/trpc/comptabilite.router";

// Wiring DI du module « comptabilite » (lectures FEC/TVA/grand-livre/balance/journal).
export interface ComptabiliteModuleDeps {
  readonly reader: IComptabiliteReader;
}

export interface ComptabiliteModule {
  readonly deps: ComptabiliteModuleDeps;
  readonly router: ReturnType<typeof createComptabiliteRouter>;
}

export function createComptabiliteModule(deps: ComptabiliteModuleDeps): ComptabiliteModule {
  return { deps, router: createComptabiliteRouter(deps.reader) };
}
