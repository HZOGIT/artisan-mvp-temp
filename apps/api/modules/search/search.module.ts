import type { ISearchReader } from "./application/search-reader";
import { createSearchRouter } from "./interface/trpc/search.router";

/** Wiring DI du module « search » (recherche globale, lecture seule). */
export interface SearchModuleDeps {
  readonly reader: ISearchReader;
}

export interface SearchModule {
  readonly deps: SearchModuleDeps;
  readonly router: ReturnType<typeof createSearchRouter>;
}

export function createSearchModule(deps: SearchModuleDeps): SearchModule {
  return { deps, router: createSearchRouter(deps.reader) };
}
