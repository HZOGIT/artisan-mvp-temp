import { trpc } from "@/shared/trpc";
import type { BiblioArticle } from "../domain/article";

/*
 * Couche APPLICATION de la feature `articles` (bibliothèque) (clean-archi) : SEULE couche important
 * tRPC. Encapsule la query (bibliothèque) et les mutations (create/update/delete/import) avec
 * invalidation, expose des données TYPÉES + des actions. L'UI attache ses effets (toast / fermeture de
 * dialogue / reset) via le `onSuccess` par appel de `.mutate()`.
 */
export function useArticles() {
  const utils = trpc.useUtils();
  const articlesQ = trpc.articles.getBibliotheque.useQuery({});

  const invalidate = () => utils.articles.getBibliotheque.invalidate();
  const create = trpc.articles.createBibliothequeArticle.useMutation({ onSuccess: invalidate });
  const update = trpc.articles.updateBibliothequeArticle.useMutation({ onSuccess: invalidate });
  const remove = trpc.articles.deleteBibliothequeArticle.useMutation({ onSuccess: invalidate });
  const importArticles = trpc.articles.importBibliothequeArticles.useMutation({ onSuccess: invalidate });

  const articles: BiblioArticle[] = articlesQ.data ?? [];

  return { articles, isLoading: articlesQ.isLoading, create, update, remove, importArticles };
}
