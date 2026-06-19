import { trpc } from "@/shared/trpc";
import type { Vehicule, Technicien, FlotteStats, AssuranceExpirant, EntretienAVenir } from "../domain/vehicules";

/*
 * Couche APPLICATION — flotte : liste + techniciens + stats + alertes (assurances/entretiens) + création
 * + suppression. SEULE couche important tRPC ; effets (toast, fermeture dialog) en UI via options.
 */
export function useVehicules() {
  const vehiculesQ = trpc.vehicules.list.useQuery();
  const techniciensQ = trpc.techniciens.getAll.useQuery();
  const statsQ = trpc.vehicules.getStatistiquesFlotte.useQuery();
  const assurancesQ = trpc.vehicules.getAssurancesExpirant.useQuery();
  const entretiensQ = trpc.vehicules.getEntretiensAVenir.useQuery();

  const refetch = () => vehiculesQ.refetch();
  const create = trpc.vehicules.create.useMutation({ onSuccess: () => refetch() });
  const remove = trpc.vehicules.delete.useMutation({ onSuccess: () => refetch() });

  const vehicules: Vehicule[] = vehiculesQ.data ?? [];
  const techniciens: Technicien[] = techniciensQ.data ?? [];
  const stats: FlotteStats | undefined = statsQ.data;
  const assurancesExpirant: AssuranceExpirant[] = assurancesQ.data ?? [];
  const entretiensAVenir: EntretienAVenir[] = entretiensQ.data ?? [];

  return { vehicules, techniciens, stats, assurancesExpirant, entretiensAVenir, create, remove };
}
