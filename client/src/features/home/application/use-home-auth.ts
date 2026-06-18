import { trpc } from "@/shared/trpc";

// Couche APPLICATION — état d'authentification pour la page vitrine (redirige vers /dashboard si déjà
// connecté). Remplace le hook legacy `@/_core/hooks/useAuth` (couplé à wouter + `@/lib/trpc`) par le
// client tRPC du front neuf. SEULE couche important tRPC.
export function useHomeAuth() {
  const { data, isLoading } = trpc.auth.me.useQuery();
  return { isAuthenticated: !!data, loading: isLoading };
}
