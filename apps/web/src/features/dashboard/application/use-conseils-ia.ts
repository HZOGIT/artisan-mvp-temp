import { trpc } from "@/shared/trpc";

/** Couche APPLICATION du widget Conseiller IA. SEULE couche important tRPC. Le cache client (4h) reste géré en UI. */
export function useConseilsIA(enabled: boolean) {
  const q = trpc.conseilsIA.useQuery(undefined, { enabled, staleTime: 4 * 60 * 60 * 1000, refetchOnWindowFocus: false, retry: false });
  return { data: q.data, isLoading: q.isLoading, refetch: q.refetch };
}
