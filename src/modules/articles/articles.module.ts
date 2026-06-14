import type { IArticleRepository } from "./application/article-repository";
import { createArticlesRouter } from "./interface/trpc/articles.router";

// Wiring DI du module articles : assemble le routeur tRPC à partir du repository injecté.
export interface ArticlesModuleDeps {
  readonly repository: IArticleRepository;
}

export interface ArticlesModule {
  readonly deps: ArticlesModuleDeps;
  readonly router: ReturnType<typeof createArticlesRouter>;
}

export function createArticlesModule(deps: ArticlesModuleDeps): ArticlesModule {
  return { deps, router: createArticlesRouter(deps.repository) };
}
