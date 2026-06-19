import { trpc } from "@/shared/trpc";
import { userInitial } from "../domain/nav";

/*
 * Couche APPLICATION du SHELL — branche les données (utilisateur+permissions via auth.me, modules actifs via
 * modules.getMine) et l'action de déconnexion. SEULE couche important tRPC. Fournit exactement les props data
 * attendues par `DashboardLayout` (user/permissions/modulesActifs/logout).
 */
export function useShell() {
  const meQ = trpc.auth.me.useQuery();
  const modulesQ = trpc.modules.getMine.useQuery();
  const utils = trpc.useUtils();
  const logoutMut = trpc.auth.logout.useMutation({
    onSuccess: () => { utils.invalidate(); window.location.href = "/signin"; },
  });
  const me = meQ.data ?? null;
  return {
    user: { name: me?.name ?? undefined, email: me?.email ?? undefined, initial: userInitial(me?.name, me?.email) },
    permissions: (me?.permissions ?? []) as string[],
    modulesActifs: modulesQ.data ?? null,
    isLoading: meQ.isLoading,
    logout: () => logoutMut.mutate(),
  };
}
