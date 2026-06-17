import { trpc } from "@/modern/shared/trpc";
import type { Tech } from "../domain/geolocalisation";

// Couche APPLICATION — géolocalisation : positions des techniciens (auto-refresh 30 s) + liste des
// techniciens (pour distinguer « aucune position » de « aucun technicien »). SEULE couche important tRPC.
export function useGeolocalisation() {
  const positionsQ = trpc.geolocalisation.getPositions.useQuery(undefined, { refetchInterval: 30_000 });
  const techniciensQ = trpc.techniciens.getAll.useQuery();

  const allTechs: Tech[] = positionsQ.data ?? [];
  return { allTechs, isLoading: positionsQ.isLoading, refetch: positionsQ.refetch, techniciens: techniciensQ.data ?? [] };
}
