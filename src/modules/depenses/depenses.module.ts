import type { IDepenseRepository } from "./application/depense-repository";
import type { ICategorieDepenseRepository } from "../categories-depenses/application/categorie-depense-repository";
import type { IBudgetCategorieRepository } from "../budgets-categories/application/budget-categorie-repository";
import { createDepensesRouter } from "./interface/trpc/depenses.router";

// Wiring DI du module depenses : assemble le routeur tRPC à partir des repositories injectés.
// `categorieRepository`/`budgetRepository` : le client appelle catégories et budgets de dépense via
// `trpc.depenses.*Categorie` / `trpc.depenses.setBudget` (parité legacy) → composés dans ce routeur en
// déléguant aux domaines categories-depenses / budgets-categories.
export interface DepensesModuleDeps {
  readonly repository: IDepenseRepository;
  readonly categorieRepository: ICategorieDepenseRepository;
  readonly budgetRepository: IBudgetCategorieRepository;
}

export interface DepensesModule {
  readonly deps: DepensesModuleDeps;
  readonly router: ReturnType<typeof createDepensesRouter>;
}

export function createDepensesModule(deps: DepensesModuleDeps): DepensesModule {
  return { deps, router: createDepensesRouter(deps.repository, deps.categorieRepository, deps.budgetRepository) };
}
