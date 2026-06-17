import { skipToken } from "@tanstack/react-query";
import { trpc } from "@/modern/shared/trpc";
import type { Intervention, Suggestion } from "../domain/planification";

export type Coords = { lat: number; lng: number };

// Couche APPLICATION — planification : interventions + suggestions de techniciens (gated sur des coords) +
// assignation. SEULE couche important tRPC ; effets (toast) gérés en UI via options.
export function usePlanification(coords: Coords | null, dateIntervention: string) {
  const interventionsQ = trpc.interventions.list.useQuery();
  const suggestionsQ = trpc.interventions.getSuggestionsTechniciens.useQuery(
    coords ? { latitude: coords.lat, longitude: coords.lng, dateIntervention } : skipToken,
  );
  const assigner = trpc.interventions.assignerTechnicien.useMutation();

  const interventions: Intervention[] = interventionsQ.data ?? [];
  const suggestions: Suggestion[] = suggestionsQ.data ?? [];

  return { interventions, suggestions, loadingSuggestions: suggestionsQ.isFetching, refetchSuggestions: suggestionsQ.refetch, assigner };
}
