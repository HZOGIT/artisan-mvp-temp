import { trpc } from "@/shared/trpc";

export function useEinvoicing() {
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.einvoicing.statutEntite.invalidate();
    utils.einvoicing.facturesEntrantes.liste.invalidate();
  };

  const statutQ = trpc.einvoicing.statutEntite.useQuery();
  const facturesQ = trpc.einvoicing.facturesEntrantes.liste.useQuery({ page: 1 });
  const onboardMut = trpc.einvoicing.onboardEntity.useMutation({ onSuccess: invalidateAll });

  const marquerLu = async (id: number) => {
    await utils.einvoicing.facturesEntrantes.lire.fetch({ id });
    utils.einvoicing.facturesEntrantes.liste.invalidate();
  };

  return {
    statut: statutQ.data,
    isLoadingStatut: statutQ.isLoading,
    facturesEntrantes: facturesQ.data ?? [],
    isLoadingFactures: facturesQ.isLoading,
    onboard: () => onboardMut.mutateAsync(undefined),
    isOnboarding: onboardMut.isPending,
    marquerLu,
  };
}
