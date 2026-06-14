import type { IArticleRepository } from "./application/article-repository";
import type { ArticlesIaDeps } from "./application/suggerer-articles-ia";
import { createArticlesRouter } from "./interface/trpc/articles.router";

// Wiring DI du module articles : assemble le routeur tRPC à partir du repository injecté + (optionnel)
// le seam IA (LlmPort + rate-limiter + lecture artisan) pour `suggererArticlesIA`. Le seam est
// optionnel : sans lui, la procédure renvoie [] (dégradation parité, jamais d'erreur).
export interface ArticlesModuleDeps {
  readonly repository: IArticleRepository;
  readonly ia?: ArticlesIaDeps;
}

export interface ArticlesModule {
  readonly deps: ArticlesModuleDeps;
  readonly router: ReturnType<typeof createArticlesRouter>;
}

export function createArticlesModule(deps: ArticlesModuleDeps): ArticlesModule {
  return { deps, router: createArticlesRouter(deps.repository, deps.ia) };
}
