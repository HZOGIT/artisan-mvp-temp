import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Analyse, Client, Intervention } from "../domain/analyses-photos";

// Couche APPLICATION — analyses photos IA : clients/interventions/profil + historique + détail (gated) +
// les 4 mutations du workflow (createAnalyse → addPhoto → analyserPhotos → genererDevis). SEULE couche tRPC.
export function useAnalysesPhotos(analyseEnCoursId: number | null) {
  const clientsQ = trpc.clients.list.useQuery();
  const interventionsQ = trpc.interventions.list.useQuery();
  const artisanQ = trpc.artisan.getProfile.useQuery();
  const historiqueQ = trpc.devisIA.list.useQuery();
  const detailQ = trpc.devisIA.getById.useQuery(analyseEnCoursId ? { id: analyseEnCoursId } : skipToken);

  const createAnalyse = trpc.devisIA.createAnalyse.useMutation();
  const addPhoto = trpc.devisIA.addPhoto.useMutation();
  const analyser = trpc.devisIA.analyserPhotos.useMutation();
  const genererDevis = trpc.devisIA.genererDevis.useMutation();

  const clients: Client[] = clientsQ.data ?? [];
  const interventions: Intervention[] = interventionsQ.data ?? [];
  const historique: Analyse[] = historiqueQ.data ?? [];

  return {
    clients, interventions, artisanProfile: artisanQ.data, historique, analyseDetail: detailQ.data,
    refetchHistorique: historiqueQ.refetch, refetchDetail: detailQ.refetch,
    createAnalyse, addPhoto, analyser, genererDevis,
  };
}
