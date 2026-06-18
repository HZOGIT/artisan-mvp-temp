import { trpc } from "@/modern/shared/trpc";
import type { MobileIntervention, EquipeMembre } from "../domain/interventions-mobile";

// Couche APPLICATION — interventions mobiles : interventions du jour + équipes + démarrer/terminer.
// SEULE couche important tRPC ; effets (toast, géoloc, refetch) gérés en UI via options.
export function useInterventionsMobile() {
  const todayQ = trpc.interventionsMobile.getTodayInterventions.useQuery();
  const equipesQ = trpc.interventions.getEquipesByArtisan.useQuery();
  const start = trpc.interventionsMobile.startIntervention.useMutation();
  const end = trpc.interventionsMobile.endIntervention.useMutation();

  const interventions = (todayQ.data ?? []) as MobileIntervention[];
  const equipes: EquipeMembre[] = equipesQ.data ?? [];
  return { interventions, equipes, isLoading: todayQ.isLoading, refetch: todayQ.refetch, start, end };
}
