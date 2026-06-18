import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/modern/shared/trpc";
import type { Client, Modele, ArticleSearchResult } from "../domain/devis-nouveau";

// Recherche d'articles via le REST public `/api/articles/search` (effet — hors React/tRPC). Renvoie [] sur échec.
export async function searchArticlesRest(query: string): Promise<ArticleSearchResult[]> {
  try {
    const res = await fetch(`/api/articles/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
    if (!res.ok) return [];
    return (await res.json()) as ArticleSearchResult[];
  } catch {
    return [];
  }
}

// Couche APPLICATION — création de devis : clients + encours + modèles + create/addLigne + modèles
// (createModele/addLigneToModele/getModeleWithLignes) + génération IA. SEULE couche important tRPC.
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

// Charge les lignes d'un modèle (à la demande).
export function useModeleLoader() {
  const utils = trpc.useUtils();
  return (modeleId: number) => utils.devis.getModeleWithLignes.fetch({ modeleId });
}
