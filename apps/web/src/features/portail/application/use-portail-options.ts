import { toast } from "sonner";
import { trpc } from "@/shared/trpc";

/** Lecture + sélection des options d'un devis depuis le portail public (token portail client). */
export function usePortailOptions(token: string, devisId: number | null) {
  const utils = trpc.useUtils();
  const safeDevisId = devisId ?? 0;
  const optionsQ = trpc.clientPortal.listerOptionsDevis.useQuery(
    { token, devisId: safeDevisId },
    { enabled: !!devisId },
  );

  const selectMutation = trpc.clientPortal.selectionnerOption.useMutation({
    onSuccess: () => {
      if (devisId) void utils.clientPortal.listerOptionsDevis.invalidate({ token, devisId });
    },
    onError: () => toast.error("Erreur lors de la sélection de la formule"),
  });

  return {
    options: optionsQ.data ?? [],
    isLoading: optionsQ.isLoading,
    select: (optionId: number) => selectMutation.mutate({ token, optionId }),
    isPending: selectMutation.isPending,
  };
}
