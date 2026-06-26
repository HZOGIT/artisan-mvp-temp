import type { DbClient } from "../../shared/db";
import type { IBudgetCategorieRepository } from "./application/budget-categorie-repository";
import { createBudgetsCategoriesRouter } from "./interface/trpc/budgets-categories.router";

/*
 * Wiring DI du module budgets-categories : assemble le routeur tRPC (CRUD catalogue + byMois) à partir
 * du repository injecté.
 */
export interface BudgetsCategoriesModuleDeps {
  readonly repository: IBudgetCategorieRepository;
  readonly db?: DbClient;
}

export interface BudgetsCategoriesModule {
  readonly deps: BudgetsCategoriesModuleDeps;
  readonly router: ReturnType<typeof createBudgetsCategoriesRouter>;
}

export function createBudgetsCategoriesModule(deps: BudgetsCategoriesModuleDeps): BudgetsCategoriesModule {
  return { deps, router: createBudgetsCategoriesRouter(deps.repository, deps.db) };
}
