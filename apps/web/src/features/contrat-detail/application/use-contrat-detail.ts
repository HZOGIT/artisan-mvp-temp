import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/shared/trpc";

/*
 * Couche APPLICATION — détail contrat : contrat (getById) + interventions liées + mutations (facture,
 * suspendre/réactiver, créer/maj intervention). SEULE couche important tRPC ; effets en UI via options.
 */
export function useContratDetail(contratId: number) {
  const enabled = contratId > 0;
  const contratQ = trpc.contrats.getById.useQuery(enabled ? { id: contratId } : skipToken);
  const interventionsQ = trpc.contrats.getInterventions.useQuery(enabled ? { contratId } : skipToken);
  /*
   * ⚠️ Le new-stack `getById` renvoie le contrat SEUL (sans `client` ni `facturesRecurrentes`) — le legacy
   * lisait `contrat.client` (inexistant, masqué par `any`) → on charge le client via `clients.getById`.
   */
  const clientId = contratQ.data?.clientId;
  const clientQ = trpc.clients.getById.useQuery(clientId ? { id: clientId } : skipToken);
  return {
    contrat: contratQ.data, isLoading: contratQ.isLoading, refetch: contratQ.refetch,
    client: clientQ.data,
    interventions: interventionsQ.data ?? [], refetchInterventions: interventionsQ.refetch,
    generateFacture: trpc.contrats.generateFacture.useMutation(),
    suspendre: trpc.contrats.suspendre.useMutation(),
    reactiver: trpc.contrats.reactiver.useMutation(),
    createIntervention: trpc.contrats.createIntervention.useMutation(),
    updateIntervention: trpc.contrats.updateIntervention.useMutation(),
    reviserPrix: trpc.contrats.reviserPrix.useMutation(),
    updateTaux: trpc.contrats.update.useMutation(),
  };
}
