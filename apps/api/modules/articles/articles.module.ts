import type { IArticleRepository } from "./application/article-repository";
import type { ArticlesIaDeps } from "./application/suggerer-articles-ia";
import type { BibliothequeReader } from "./application/bibliotheque-reader";
import type { BibliothequeWriter } from "./application/bibliotheque-writer";
import { createArticlesRouter } from "./interface/trpc/articles.router";

// Wiring DI du module articles : assemble le routeur tRPC à partir du repository injecté + (optionnel)
// le seam IA (`suggererArticlesIA`) + (optionnel) le reader bibliothèque partagée (read public) + le
// writer bibliothèque (writes admin-only). Les seams sont optionnels : sans IA → [] ; sans biblio → [].
export interface ArticlesModuleDeps {
  readonly repository: IArticleRepository;
  readonly ia?: ArticlesIaDeps;
  readonly bibliotheque?: BibliothequeReader;
  readonly bibliothequeWriter?: BibliothequeWriter;
}

export interface ArticlesModule {
  readonly deps: ArticlesModuleDeps;
  readonly router: ReturnType<typeof createArticlesRouter>;
}

export function createArticlesModule(deps: ArticlesModuleDeps): ArticlesModule {
  return { deps, router: createArticlesRouter(deps.repository, deps.ia, deps.bibliotheque, deps.bibliothequeWriter) };
}
