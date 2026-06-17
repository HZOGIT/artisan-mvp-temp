import { trpc } from "@/modern/shared/trpc";

// Couche APPLICATION de la feature `signature` (clean-archi) : SEULE couche important tRPC.
// Encapsule la query publique (devis à signer par token) et les mutations (signer / refuser /
// sélectionner une option) ; invalide la vue après sélection d'option. L'UI attache ses effets (toast /
// transition d'état accepte/refuse) via le `onSuccess`/`onError` par appel de `.mutate()`.
export function useSignature(token: string) {
  const utils = trpc.useUtils();
  const query = trpc.signature.getDevisForSignature.useQuery({ token }, { enabled: !!token });

  const sign = trpc.signature.signDevis.useMutation();
  const refuse = trpc.signature.refuseDevis.useMutation();
  const selectOption = trpc.signature.selectDevisOption.useMutation({
    onSuccess: () => utils.signature.getDevisForSignature.invalidate({ token }),
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    sign,
    refuse,
    selectOption,
  };
}
