import { trpc } from "@/modern/shared/trpc";
import type {
  ActiviteRow,
  ClientDetail,
  DevisRow,
  FactureRow,
  InterventionRow,
  PortalStatus,
} from "../domain/client";

// Couche APPLICATION de la vue DÉTAIL client (clean-archi) : SEULE couche important tRPC pour cette
// vue. Encapsule toutes les queries (client + devis/factures/interventions + portail + activités) et
// les mutations (portail, activités), gère l'invalidation, et expose des données TYPÉES + des actions.
// L'UI (`client-detail-page.tsx`) ne connaît plus le transport — elle ajoute ses toasts via le
// `onSuccess` par appel de `.mutate()` (l'invalidation, elle, vit ici).
export function useClientDetail(clientId: number) {
  const utils = trpc.useUtils();
  const enabled = clientId > 0;

  const clientQ = trpc.clients.getById.useQuery({ id: clientId }, { enabled });
  const devisQ = trpc.devis.list.useQuery();
  const facturesQ = trpc.factures.list.useQuery();
  const interventionsQ = trpc.interventions.list.useQuery();
  const portalQ = trpc.clientPortal.getStatus.useQuery({ clientId }, { enabled });
  const activitesQ = trpc.activites.list.useQuery();

  const invalidatePortal = () => utils.clientPortal.getStatus.invalidate({ clientId });
  const invalidateActivites = () => utils.activites.list.invalidate();

  const generateAccess = trpc.clientPortal.generateAccess.useMutation({ onSuccess: invalidatePortal });
  const deactivateAccess = trpc.clientPortal.deactivate.useMutation({ onSuccess: invalidatePortal });
  const createActivite = trpc.activites.create.useMutation({ onSuccess: invalidateActivites });
  const toggleActivite = trpc.activites.toggleFait.useMutation({ onSuccess: invalidateActivites });
  const deleteActivite = trpc.activites.delete.useMutation({ onSuccess: invalidateActivites });

  const client: ClientDetail | undefined = clientQ.data ?? undefined;
  const devis: DevisRow[] = devisQ.data ?? [];
  const factures: FactureRow[] = facturesQ.data ?? [];
  const interventions: InterventionRow[] = interventionsQ.data ?? [];
  const activites: ActiviteRow[] = activitesQ.data ?? [];
  const portalStatus: PortalStatus | undefined = portalQ.data ?? undefined;

  return {
    client,
    isLoading: clientQ.isLoading,
    devis,
    factures,
    interventions,
    activites,
    portalStatus,
    generateAccess,
    deactivateAccess,
    createActivite,
    toggleActivite,
    deleteActivite,
  };
}

export type ClientDetailVM = ReturnType<typeof useClientDetail>;
