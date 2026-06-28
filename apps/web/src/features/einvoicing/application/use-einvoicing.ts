import { trpc } from "@/shared/trpc";
import { apiUrl } from "@/shared/backend-url";

export function useEinvoicing() {
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.einvoicing.statutEntite.invalidate();
    utils.einvoicing.facturesEntrantes.liste.invalidate();
    utils.einvoicing.oauthStatut.invalidate();
  };

  const statutQ = trpc.einvoicing.statutEntite.useQuery();
  const oauthQ = trpc.einvoicing.oauthStatut.useQuery();
  const facturesQ = trpc.einvoicing.facturesEntrantes.liste.useQuery({ page: 1 });
  const onboardMut = trpc.einvoicing.onboardEntity.useMutation({ onSuccess: invalidateAll });

  const marquerLu = async (id: number) => {
    await utils.einvoicing.facturesEntrantes.lire.fetch({ id });
    utils.einvoicing.facturesEntrantes.liste.invalidate();
  };

  const connecterSuperpdp = () => {
    window.location.href = apiUrl("/api/einvoicing/oauth/authorize");
  };

  return {
    statut: statutQ.data,
    isLoadingStatut: statutQ.isLoading,
    oauthStatut: oauthQ.data,
    isLoadingOauth: oauthQ.isLoading,
    facturesEntrantes: facturesQ.data ?? [],
    isLoadingFactures: facturesQ.isLoading,
    onboard: () => onboardMut.mutateAsync(undefined),
    isOnboarding: onboardMut.isPending,
    marquerLu,
    connecterSuperpdp,
  };
}
