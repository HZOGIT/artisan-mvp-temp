import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";
import type { Chantier, Client, Phase, Pointage, InterventionCh, SuiviEtape, Activite, Technicien } from "../domain/chantiers";

/*
 * Couche APPLICATION — chantiers : liste + détail (+ sous-ressources gated sur la sélection) + toutes les
 * mutations (CRUD chantier, suivi, pointages, rappels CRM). SEULE couche important tRPC.
 */
export function useChantiers(selectedChantier: number | null) {
  const utils = trpc.useUtils();
  const byId = selectedChantier ? { chantierId: selectedChantier } : skipToken;

  const listQ = trpc.chantiers.list.useQuery();
  const clientsQ = trpc.clients.list.useQuery();
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const detailQ = trpc.chantiers.getById.useQuery(selectedChantier ? { id: selectedChantier } : skipToken);
  const phasesQ = trpc.chantiers.getPhases.useQuery(byId);
  const interventionsQ = trpc.chantiers.getInterventions.useQuery(byId);
  const statsQ = trpc.chantiers.getStatistiques.useQuery(byId);
  const suiviQ = trpc.chantiers.getSuivi.useQuery(byId);
  const pointagesQ = trpc.chantiers.getPointages.useQuery(byId);
  const activitesQ = trpc.activites.list.useQuery();

  const invSuivi = () => utils.chantiers.getSuivi.invalidate();
  const invPointages = () => utils.chantiers.getPointages.invalidate();
  const invList = () => utils.chantiers.list.invalidate();
  const refetchActivites = () => activitesQ.refetch();

  return {
    chantiers: (listQ.data ?? []) as Chantier[], clients: (clientsQ.data ?? []) as Client[],
    techniciens: (techniciensQ.data ?? []) as Technicien[], chantierDetails: detailQ.data,
    phases: (phasesQ.data ?? []) as Phase[], interventions: (interventionsQ.data ?? []) as InterventionCh[],
    statistiques: statsQ.data, suiviEtapes: (suiviQ.data ?? []) as SuiviEtape[],
    pointages: (pointagesQ.data ?? []) as Pointage[], activites: (activitesQ.data ?? []) as Activite[],
    isLoading: listQ.isLoading,
    create: trpc.chantiers.create.useMutation({ onSuccess: invList }),
    update: trpc.chantiers.update.useMutation({ onSuccess: () => { invList(); utils.chantiers.getById.invalidate(); } }),
    remove: trpc.chantiers.delete.useMutation({ onSuccess: invList }),
    createSuivi: trpc.chantiers.createSuivi.useMutation({ onSuccess: invSuivi }),
    updateSuivi: trpc.chantiers.updateSuivi.useMutation({ onSuccess: invSuivi }),
    deleteSuivi: trpc.chantiers.deleteSuivi.useMutation({ onSuccess: invSuivi }),
    addPointage: trpc.chantiers.addPointage.useMutation({ onSuccess: invPointages }),
    deletePointage: trpc.chantiers.deletePointage.useMutation({ onSuccess: invPointages }),
    createRappel: trpc.activites.create.useMutation({ onSuccess: refetchActivites }),
    toggleRappel: trpc.activites.toggleFait.useMutation({ onSuccess: refetchActivites }),
    deleteRappel: trpc.activites.delete.useMutation({ onSuccess: refetchActivites }),
  };
}
