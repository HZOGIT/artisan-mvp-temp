import { trpc } from "@/shared/trpc";
import type { Prevision, Comparaison, HistoriqueItem } from "../domain/previsions";

// Couche APPLICATION — prévisions de CA : historique (24 mois) + prévisions (année) + comparaison + calcul.
// SEULE couche important tRPC ; effets (toast) en UI via options.
export function usePrevisions(annee: number) {
  const historiqueQ = trpc.previsions.getHistorique.useQuery({ nombreMois: 24 });
  const previsionsQ = trpc.previsions.getPrevisions.useQuery({ annee });
  const comparaisonQ = trpc.previsions.getComparaison.useQuery({ annee });

  const calculer = trpc.previsions.calculer.useMutation({
    onSuccess: () => { previsionsQ.refetch(); comparaisonQ.refetch(); },
  });

  const historique: HistoriqueItem[] = historiqueQ.data ?? [];
  const previsions: Prevision[] = previsionsQ.data ?? [];
  const comparaison: Comparaison[] = comparaisonQ.data ?? [];

  return { historique, previsions, comparaison, isLoading: historiqueQ.isLoading || previsionsQ.isLoading, calculer };
}
