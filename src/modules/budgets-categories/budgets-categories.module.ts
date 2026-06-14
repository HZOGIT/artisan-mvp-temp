import type { IBudgetCategorieRepository } from "./application/budget-categorie-repository";

// Wiring DI du module budgets-categories. À l'étape scaffold, le module ne porte que ses
// dépendances ; le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface BudgetsCategoriesModuleDeps {
  readonly repository: IBudgetCategorieRepository;
}

export interface BudgetsCategoriesModule {
  readonly deps: BudgetsCategoriesModuleDeps;
}

export function createBudgetsCategoriesModule(deps: BudgetsCategoriesModuleDeps): BudgetsCategoriesModule {
  return { deps };
}
