import { trpc } from "@/shared/trpc";
import type { Utilisateur, CurrentUser } from "../domain/utilisateur";

// Couche APPLICATION de la feature `utilisateurs` (clean-archi) : SEULE couche important tRPC.
// `useUtilisateurs` charge l'équipe + l'utilisateur courant (pour le garde admin / « c'est moi ») et
// expose invite/updateRole/toggleActif. `useUtilisateurPermissions` pilote le dialog de permissions
// (lecture conditionnelle + sauvegarde + réinitialisation selon le rôle). Effets de présentation
// (toasts, dialogs) attachés par l'UI via `mutate(vars, { onSuccess, onError })`.
export function useUtilisateurs() {
  const utils = trpc.useUtils();
  const listQ = trpc.utilisateurs.list.useQuery();
  const meQ = trpc.auth.me.useQuery();

  const invalidate = () => utils.utilisateurs.list.invalidate();

  const invite = trpc.utilisateurs.invite.useMutation({ onSuccess: invalidate });
  const updateRole = trpc.utilisateurs.updateRole.useMutation({ onSuccess: invalidate });
  const toggleActif = trpc.utilisateurs.toggleActif.useMutation({ onSuccess: invalidate });

  const utilisateurs: Utilisateur[] = listQ.data ?? [];
  const currentUser: CurrentUser | null = meQ.data ?? null;

  return { utilisateurs, currentUser, invite, updateRole, toggleActif };
}

export function useUtilisateurPermissions(userId: number, enabled: boolean) {
  const utils = trpc.useUtils();
  const permQ = trpc.utilisateurs.getPermissions.useQuery({ userId }, { enabled });

  const invalidateList = () => utils.utilisateurs.list.invalidate();

  const updatePermissions = trpc.utilisateurs.updatePermissions.useMutation({ onSuccess: invalidateList });
  const resetPermissions = trpc.utilisateurs.resetPermissions.useMutation({ onSuccess: invalidateList });

  return { permData: permQ.data, isLoading: permQ.isLoading, updatePermissions, resetPermissions };
}
