import type { IArticleRepository } from "./application/article-repository";

// Wiring DI du module articles. À l'étape scaffold, le module ne porte que ses dépendances ;
// le routeur tRPC sera assemblé et exposé à l'étape interface (5/9).
export interface ArticlesModuleDeps {
  readonly repository: IArticleRepository;
}

export interface ArticlesModule {
  readonly deps: ArticlesModuleDeps;
}

export function createArticlesModule(deps: ArticlesModuleDeps): ArticlesModule {
  return { deps };
}
