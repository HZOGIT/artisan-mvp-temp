import type { IDepenseRepository } from "./application/depense-repository";
import type { ICategorieDepenseRepository } from "../categories-depenses/application/categorie-depense-repository";
import { createDepensesRouter } from "./interface/trpc/depenses.router";

// Wiring DI du module depenses : assemble le routeur tRPC à partir des repositories injectés.
// `categorieRepository` : le client appelle les catégories de dépense via `trpc.depenses.*Categorie`
// (parité legacy) → composées dans ce routeur en déléguant au domaine categories-depenses.
export interface DepensesModuleDeps {
  readonly repository: IDepenseRepository;
  readonly categorieRepository: ICategorieDepenseRepository;
}

export interface DepensesModule {
  readonly deps: DepensesModuleDeps;
  readonly router: ReturnType<typeof createDepensesRouter>;
}

export function createDepensesModule(deps: DepensesModuleDeps): DepensesModule {
  return { deps, router: createDepensesRouter(deps.repository, deps.categorieRepository) };
}
