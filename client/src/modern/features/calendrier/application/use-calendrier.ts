import { trpc } from "@/modern/shared/trpc";
import type {
  Intervention, InterventionClient, EquipeByArtisanRow,
} from "../../interventions/domain/intervention";

// Couche APPLICATION de la feature `calendrier` (clean-archi) : SEULE couche important tRPC.
// Charge les interventions, les clients (résolution de nom/adresse) et les équipes (1 requête,
// anti N+1) et expose les mutations create/update (planifier / déplacer par glisser-déposer) avec
// invalidation de la liste. Les effets de présentation (toasts, dialog) sont attachés par l'UI.
export function useCalendrier() {
  const utils = trpc.useUtils();
  const interventionsQ = trpc.interventions.list.useQuery();
  const clientsQ = trpc.clients.list.useQuery();
  const equipesQ = trpc.interventions.getEquipesByArtisan.useQuery();

  const invalidate = () => utils.interventions.list.invalidate();

  const create = trpc.interventions.create.useMutation({ onSuccess: invalidate });
  const update = trpc.interventions.update.useMutation({ onSuccess: invalidate });

  const interventions: Intervention[] = interventionsQ.data ?? [];
  const clients: InterventionClient[] = clientsQ.data ?? [];
  const equipesByArtisan: EquipeByArtisanRow[] = equipesQ.data ?? [];

  return { interventions, clients, equipesByArtisan, isLoading: interventionsQ.isLoading, create, update };
}
