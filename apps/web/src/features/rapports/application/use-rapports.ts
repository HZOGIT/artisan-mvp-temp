import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Rapport, ResultatRapport } from "../domain/rapports";

/*
 * Couche APPLICATION — rapports : liste + exécution (gated par sélection via skipToken) + CRUD + favori.
 * SEULE couche important tRPC.
 */
export function useRapports(selectedRapport: number | null, dateDebut: string, dateFin: string) {
  const listQ = trpc.rapports.list.useQuery();
  const resultatsQ = trpc.rapports.executer.useQuery(
    selectedRapport ? { rapportId: selectedRapport, parametres: { dateDebut, dateFin } } : skipToken,
  );
  const refetch = () => listQ.refetch();

  const create = trpc.rapports.create.useMutation({ onSuccess: () => refetch() });
  const remove = trpc.rapports.delete.useMutation({ onSuccess: () => refetch() });
  const toggleFavori = trpc.rapports.toggleFavori.useMutation({ onSuccess: () => refetch() });

  const rapports: Rapport[] = listQ.data ?? [];
  const resultats: ResultatRapport | undefined = resultatsQ.data;

  return { rapports, resultats, loadingResultats: resultatsQ.isLoading, create, remove, toggleFavori };
}
