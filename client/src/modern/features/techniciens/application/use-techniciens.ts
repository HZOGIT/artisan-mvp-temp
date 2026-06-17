import { trpc } from "@/modern/shared/trpc";
import type { LinkableUser, Technicien } from "../domain/technicien";

// Couche APPLICATION de la feature `techniciens` (clean-archi) : SEULE couche important tRPC.
// `useTechniciens` couvre la liste + comptes liables + le CRUD ; `useTechnicienDetail` isole les
// données du technicien sélectionné (stats + habilitations, queries dépendantes) + leurs mutations.
// L'UI attache ses effets (toast / fermeture de dialogue / reset) via le `onSuccess` par appel.
export function useTechniciens() {
  const utils = trpc.useUtils();
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const linkableUsersQ = trpc.techniciens.getLinkableUsers.useQuery();

  const invalidate = () => utils.techniciens.getAll.invalidate();
  const create = trpc.techniciens.create.useMutation({ onSuccess: invalidate });
  const update = trpc.techniciens.update.useMutation({ onSuccess: invalidate });
  const remove = trpc.techniciens.delete.useMutation({ onSuccess: invalidate });

  const techniciens: Technicien[] = techniciensQ.data ?? [];
  const linkableUsers: LinkableUser[] = linkableUsersQ.data ?? [];

  return { techniciens, linkableUsers, create, update, remove };
}

// Détail du technicien sélectionné (stats + habilitations) — queries dépendantes de l'état UI.
export function useTechnicienDetail(technicienId: number | null) {
  const utils = trpc.useUtils();
  const enabled = technicienId != null;
  const statsQ = trpc.techniciens.getStats.useQuery(
    { technicienId: technicienId ?? 0 },
    { enabled },
  );
  const habilitationsQ = trpc.techniciens.getHabilitations.useQuery(
    { technicienId: technicienId ?? 0 },
    { enabled },
  );

  const invalidateHabil = () => utils.techniciens.getHabilitations.invalidate();
  const addHabilitation = trpc.techniciens.addHabilitation.useMutation({ onSuccess: invalidateHabil });
  const deleteHabilitation = trpc.techniciens.deleteHabilitation.useMutation({ onSuccess: invalidateHabil });

  return {
    stats: statsQ.data,
    habilitations: habilitationsQ.data ?? [],
    addHabilitation,
    deleteHabilitation,
  };
}
