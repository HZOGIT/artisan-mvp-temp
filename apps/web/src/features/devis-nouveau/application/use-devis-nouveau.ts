import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Client, Modele } from "../domain/devis-nouveau";

/** Recherche d'articles via `articles.search` (tRPC publicProcedure). Renvoie [] si aucun résultat. */
export function useSearchArticles() {
  const utils = trpc.useUtils();
  return (query: string) => utils.articles.search.fetch({ query }).catch(() => []);
}

/*
 * Couche APPLICATION — création de devis : clients + encours + modèles + create/addLigne + modèles
 * (createModele/addLigneToModele/getModeleWithLignes) + génération IA. SEULE couche important tRPC.
 */
export function useDevisNouveau(clientId: number) {
  const utils = trpc.useUtils();
  const clientsQ = trpc.clients.list.useQuery();
  const encoursQ = trpc.clients.getEncours.useQuery(clientId > 0 ? { clientId } : skipToken);
  const modelesQ = trpc.devis.getModeles.useQuery();
  return {
    clients: (clientsQ.data ?? []) as Client[],
    encours: encoursQ.data,
    modeles: (modelesQ.data ?? []) as Modele[],
    refetchModeles: modelesQ.refetch,
    utils,
    create: trpc.devis.create.useMutation(),
    addLigne: trpc.devis.addLigne.useMutation(),
    createModele: trpc.devis.createModele.useMutation(),
    addLigneToModele: trpc.devis.addLigneToModele.useMutation(),
    genererIA: trpc.devis.genererLignesIA.useMutation(),
  };
}

/** Charge les lignes d'un modèle (à la demande). */
export function useModeleLoader() {
  const utils = trpc.useUtils();
  return (modeleId: number) => utils.devis.getModeleWithLignes.fetch({ modeleId });
}
