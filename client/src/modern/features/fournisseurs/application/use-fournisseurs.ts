import { trpc } from "@/modern/shared/trpc";
import type { Article, Fournisseur } from "../domain/fournisseur";

// Couche APPLICATION de la feature `fournisseurs` (clean-archi) : SEULE couche important tRPC.
// `useFournisseurs` couvre la liste + le référentiel articles + le CRUD ; `useFournisseurArticles`
// isole les articles associés d'UN fournisseur (query dépendante) + association/dissociation.
// L'UI attache ses effets (toast / fermeture de dialogue / reset) via le `onSuccess` par appel.
export function useFournisseurs() {
  const utils = trpc.useUtils();
  const fournisseursQ = trpc.fournisseurs.list.useQuery();
  const articlesQ = trpc.articles.getArtisanArticles.useQuery();

  const invalidate = () => utils.fournisseurs.list.invalidate();
  const create = trpc.fournisseurs.create.useMutation({ onSuccess: invalidate });
  const update = trpc.fournisseurs.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.fournisseurs.delete.useMutation({ onSuccess: invalidate });

  const fournisseurs: Fournisseur[] = fournisseursQ.data ?? [];
  const articles: Article[] = articlesQ.data ?? [];

  return { fournisseurs, articles, isLoading: fournisseursQ.isLoading, create, update, remove };
}

// Articles associés d'UN fournisseur (query dépendante : seulement quand le dialogue est ouvert).
export function useFournisseurArticles(fournisseurId: number, enabled: boolean) {
  const utils = trpc.useUtils();
  const q = trpc.fournisseurs.getFournisseurArticles.useQuery(
    { fournisseurId },
    { enabled: enabled && fournisseurId > 0 },
  );
  const invalidate = () => utils.fournisseurs.getFournisseurArticles.invalidate();
  const associate = trpc.fournisseurs.associateArticle.useMutation({ onSuccess: invalidate });
  const dissociate = trpc.fournisseurs.dissociateArticle.useMutation({ onSuccess: invalidate });

  return { fournisseurArticles: q.data ?? [], isLoading: q.isLoading, associate, dissociate };
}
