import { trpc } from "@/shared/trpc";
import type { AssuranceExpirant, EntretienAVenir, Vehicule } from "../domain/flotte";

/*
 * Couche APPLICATION de la feature `flotte` (clean-archi) : SEULE couche important tRPC.
 * Page de consultation (lecture seule) : agrège les 4 rapports du parc (stats, véhicules, entretiens à
 * venir, assurances expirant) et les expose typés à l'UI. Aucune mutation.
 */
export function useFlotte() {
  const statsQ = trpc.vehicules.getStatistiquesFlotte.useQuery();
  const vehiculesQ = trpc.vehicules.list.useQuery();
  const entretiensQ = trpc.vehicules.getEntretiensAVenir.useQuery();
  const assurancesQ = trpc.vehicules.getAssurancesExpirant.useQuery();

  const vehicules: Vehicule[] = vehiculesQ.data ?? [];
  const entretiens: EntretienAVenir[] = entretiensQ.data ?? [];
  const assurances: AssuranceExpirant[] = assurancesQ.data ?? [];

  return { stats: statsQ.data, vehicules, entretiens, assurances };
}
