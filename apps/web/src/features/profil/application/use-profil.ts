import { trpc } from "@/shared/trpc";

/*
 * Couche APPLICATION — profil : profil entreprise (getProfile/updateProfile) + identifiants compte
 * (auth.me pour l'email courant + updateEmail/updatePassword/deleteAccount). SEULE couche tRPC.
 */
export function useProfil() {
  const profileQ = trpc.artisan.getProfile.useQuery();
  return {
    artisan: profileQ.data, isLoading: profileQ.isLoading,
    updateProfile: trpc.artisan.updateProfile.useMutation(),
  };
}

export function useAccountSettings() {
  const utils = trpc.useUtils();
  const meQ = trpc.auth.me.useQuery();
  return {
    currentEmail: meQ.data?.email ?? "",
    updateEmail: trpc.auth.updateEmail.useMutation({ onSuccess: () => utils.auth.me.invalidate() }),
    updatePassword: trpc.auth.updatePassword.useMutation(),
    deleteAccount: trpc.auth.deleteAccount.useMutation({ onSuccess: () => utils.invalidate() }),
  };
}
