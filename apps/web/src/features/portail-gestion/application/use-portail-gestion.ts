import { trpc } from "@/shared/trpc";
import type { PortailClient } from "../domain/portail-gestion";

/*
 * Couche APPLICATION de la feature `portail-gestion` (clean-archi) : SEULE couche important tRPC.
 * `usePortailClients` charge la liste des clients ; `useClientPortail` isole l'accès portail d'UN client
 * (statut + génération/désactivation, query dépendante par ligne). L'UI attache ses effets (toast /
 * presse-papier) via le `onSuccess`/`onError` par appel de `.mutate()`.
 */
export function usePortailClients() {
  const q = trpc.clients.list.useQuery();
  const clients: PortailClient[] = q.data ?? [];
  return { clients, isLoading: q.isLoading };
}

export function useClientPortail(clientId: number) {
  const utils = trpc.useUtils();
  const statusQ = trpc.clientPortal.getStatus.useQuery({ clientId }, { staleTime: 30_000 });

  const invalidate = () => utils.clientPortal.getStatus.invalidate({ clientId });
  const generateAccess = trpc.clientPortal.generateAccess.useMutation({ onSuccess: invalidate });
  const deactivate = trpc.clientPortal.deactivate.useMutation({ onSuccess: invalidate });

  return { status: statusQ.data, generateAccess, deactivate };
}
