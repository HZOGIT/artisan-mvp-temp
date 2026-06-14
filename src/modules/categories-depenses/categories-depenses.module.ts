import type { ICategorieDepenseRepository } from "./application/categorie-depense-repository";

// Wiring DI du module categories-depenses. À l'étape scaffold, le module ne porte que ses
// dépendances ; le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface CategoriesDepensesModuleDeps {
  readonly repository: ICategorieDepenseRepository;
}

export interface CategoriesDepensesModule {
  readonly deps: CategoriesDepensesModuleDeps;
}

export function createCategoriesDepensesModule(deps: CategoriesDepensesModuleDeps): CategoriesDepensesModule {
  return { deps };
}
