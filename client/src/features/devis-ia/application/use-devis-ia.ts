import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Analyse, Client } from "../domain/devis-ia";

// Couche APPLICATION — éditeur devis IA : liste + clients + détail (gated) + les 6 mutations (créer
// analyse, ajouter photo, analyser, MAJ suggestion, générer devis). SEULE couche important tRPC.
export function useDevisIA(selectedAnalyse: number | null) {
  const utils = trpc.useUtils();
  const listQ = trpc.devisIA.list.useQuery();
  const clientsQ = trpc.clients.list.useQuery();
  const detailQ = trpc.devisIA.getById.useQuery(selectedAnalyse ? { id: selectedAnalyse } : skipToken);

  const invalidateDetail = () => utils.devisIA.getById.invalidate();
  const invalidateList = () => utils.devisIA.list.invalidate();

  const createAnalyse = trpc.devisIA.createAnalyse.useMutation({ onSuccess: invalidateList });
  const addPhoto = trpc.devisIA.addPhoto.useMutation({ onSuccess: invalidateDetail });
  const analyser = trpc.devisIA.analyserPhotos.useMutation({ onSuccess: () => { invalidateDetail(); invalidateList(); } });
  const updateSuggestion = trpc.devisIA.updateSuggestion.useMutation({ onSuccess: invalidateDetail });
  const genererDevis = trpc.devisIA.genererDevis.useMutation({ onSuccess: invalidateDetail });

  const analyses: Analyse[] = listQ.data ?? [];
  const clients: Client[] = clientsQ.data ?? [];

  return { analyses, clients, analyseDetails: detailQ.data, isLoading: listQ.isLoading, createAnalyse, addPhoto, analyser, updateSuggestion, genererDevis };
}
