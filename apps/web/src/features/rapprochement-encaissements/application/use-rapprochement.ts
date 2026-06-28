import { trpc } from "@/shared/trpc";

/** Application layer — rapprochement encaissements (lettrage crédit → facture). */
export function useRapprochement() {
  const suggestionsQ = trpc.depenses.getSuggestionsRapprochement.useQuery();
  const rapprocher = trpc.depenses.rapprocher.useMutation({
    onSuccess: () => suggestionsQ.refetch(),
  });

  return {
    items: suggestionsQ.data ?? [],
    isLoading: suggestionsQ.isLoading,
    rapprocher,
  };
}
