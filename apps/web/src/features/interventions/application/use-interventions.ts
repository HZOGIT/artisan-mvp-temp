import { trpc } from "@/shared/trpc";
import type {
  EquipeByArtisanRow,
  Intervention,
  InterventionClient,
  Technicien,
} from "../domain/intervention";

// Couche APPLICATION de la feature `interventions` (clean-archi) : SEULE couche important tRPC.
// `useInterventions` couvre la liste + référentiels (clients, techniciens, équipes agrégées) et le CRUD ;
// `useEquipe` isole l'équipe d'UNE intervention (query dépendante de l'état UI) + ses mutations.
// L'UI attache ses effets (toast/fermeture de dialogue/reset) via le `onSuccess` par appel.
export function useInterventions() {
  const utils = trpc.useUtils();
  const interventionsQ = trpc.interventions.list.useQuery();
  const clientsQ = trpc.clients.list.useQuery();
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const equipesByArtisanQ = trpc.interventions.getEquipesByArtisan.useQuery();

  const invalidateList = () => utils.interventions.list.invalidate();
  const create = trpc.interventions.create.useMutation({ onSuccess: invalidateList });
  const update = trpc.interventions.update.useMutation({ onSuccess: invalidateList });
  const remove = trpc.interventions.delete.useMutation({ onSuccess: invalidateList });

  const interventions: Intervention[] = interventionsQ.data ?? [];
  const clients: InterventionClient[] = clientsQ.data ?? [];
  const techniciens: Technicien[] = techniciensQ.data ?? [];
  const equipesByArtisan: EquipeByArtisanRow[] = equipesByArtisanQ.data ?? [];

  return {
    interventions,
    clients,
    techniciens,
    equipesByArtisan,
    isLoading: interventionsQ.isLoading,
    create,
    update,
    remove,
  };
}

// Équipe d'UNE intervention (query dépendante : ouverte uniquement quand le dialogue d'édition l'est).
export function useEquipe(interventionId: number, enabled: boolean) {
  const utils = trpc.useUtils();
  const equipeQ = trpc.interventions.getEquipe.useQuery(
    { interventionId },
    { enabled: enabled && interventionId > 0 },
  );
  const invalidate = () => utils.interventions.getEquipe.invalidate();
  const addMembre = trpc.interventions.ajouterMembreEquipe.useMutation({ onSuccess: invalidate });
  const removeMembre = trpc.interventions.retirerMembreEquipe.useMutation({ onSuccess: invalidate });

  return { equipe: equipeQ.data ?? [], addMembre, removeMembre };
}
