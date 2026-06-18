import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/modern/shared/trpc";
import type { BiblioArticle, Suggestion } from "../domain/devis-ligne";

// Couche APPLICATION — ajout de ligne de devis : devis (getById) + bibliothèque + suggestions IA (gated) +
// création article + addLigne. SEULE couche important tRPC ; effets en UI via options.
export function useDevisLigne(devisId: number, searchQuery: string, iaEnabled: boolean) {
  const utils = trpc.useUtils();
  const devisQ = trpc.devis.getById.useQuery(devisId > 0 ? { id: devisId } : skipToken);
  const articlesQ = trpc.articles.getBibliotheque.useQuery({});
  const iaQ = trpc.articles.suggererArticlesIA.useQuery(
    iaEnabled && searchQuery.length >= 3 ? { query: searchQuery, contexte: "creation de devis" } : skipToken,
    { staleTime: 60_000 },
  );
  return {
    devis: devisQ.data, devisLoading: devisQ.isLoading,
    articles: (articlesQ.data ?? []) as BiblioArticle[], articlesLoading: articlesQ.isLoading,
    suggestionsIA: (iaQ.data ?? []) as Suggestion[], iaLoading: iaQ.isFetching,
    createArticle: trpc.articles.createArtisanArticle.useMutation({ onSuccess: () => utils.articles.getBibliotheque.invalidate() }),
    addLigne: trpc.devis.addLigne.useMutation({ onSuccess: () => utils.devis.getById.invalidate({ id: devisId }) }),
  };
}
