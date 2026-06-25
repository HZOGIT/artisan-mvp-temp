import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Fournisseur, ArtisanArticle, DevisAccepte } from "../domain/commande-form";

/** Recherche bibliothèque via `articles.search` (tRPC publicProcedure). Renvoie [] si aucun résultat. */
export function useSearchBiblio() {
  const utils = trpc.useUtils();
  return (query: string) => utils.articles.search.fetch({ query }).catch(() => []);
}

/*
 * Couche APPLICATION — formulaire de commande : fournisseurs + articles artisan + devis acceptés (IA, gated) +
 * commande/lignes existantes (édition) + create/update/sendEmail + génération IA. SEULE couche important tRPC.
 */
export function useCommandeForm(commandeId: number, iaSectionOpen: boolean) {
  const utils = trpc.useUtils();
  const isEdit = commandeId > 0;
  const fournisseursQ = trpc.fournisseurs.list.useQuery();
  const artisanArticlesQ = trpc.articles.getArtisanArticles.useQuery();
  const devisAcceptesQ = trpc.commandesFournisseurs.listDevisAcceptes.useQuery(iaSectionOpen ? undefined : skipToken, { staleTime: 60_000 });
  const commandeQ = trpc.commandesFournisseurs.getById.useQuery(isEdit ? { id: commandeId } : skipToken);
  const lignesQ = trpc.commandesFournisseurs.getLignes.useQuery(isEdit ? { commandeId } : skipToken);
  return {
    fournisseurs: (fournisseursQ.data ?? []) as Fournisseur[],
    artisanArticles: (artisanArticlesQ.data ?? []) as ArtisanArticle[],
    devisAcceptes: devisAcceptesQ.data, devisAcceptesList: (devisAcceptesQ.data ?? []) as DevisAccepte[],
    commande: commandeQ.data, lignesExistantes: lignesQ.data ?? [], utils,
    create: trpc.commandesFournisseurs.create.useMutation(),
    update: trpc.commandesFournisseurs.update.useMutation(),
    sendEmail: trpc.commandesFournisseurs.sendEmail.useMutation(),
    genererIA: trpc.commandesFournisseurs.genererDepuisDevisIA.useMutation(),
  };
}
