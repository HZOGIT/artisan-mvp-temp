import type { DbClient } from "../../shared/db";
import type { ICategorieDepenseRepository } from "./application/categorie-depense-repository";
import { createCategoriesDepensesRouter } from "./interface/trpc/categories-depenses.router";

/*
 * Wiring DI du module categories-depenses : assemble le routeur tRPC (CRUD catalogue) à partir du
 * repository injecté.
 */
export interface CategoriesDepensesModuleDeps {
  readonly repository: ICategorieDepenseRepository;
  readonly db?: DbClient;
}

export interface CategoriesDepensesModule {
  readonly deps: CategoriesDepensesModuleDeps;
  readonly router: ReturnType<typeof createCategoriesDepensesRouter>;
}

export function createCategoriesDepensesModule(deps: CategoriesDepensesModuleDeps): CategoriesDepensesModule {
  return { deps, router: createCategoriesDepensesRouter(deps.repository, deps.db) };
}
