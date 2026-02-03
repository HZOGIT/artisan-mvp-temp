import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  // Query current user
  const { data: user, isLoading: loading, refetch } = trpc.auth.me.useQuery();
  
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      // Invalider le cache pour forcer un refresh de auth.me
      queryClient.invalidateQueries();
      // Rediriger vers signin
      setLocation("/signin");
    },
  });

  // Redirect to signin if not authenticated and option is set
  useEffect(() => {
    if (options?.redirectOnUnauthenticated && !loading && !user) {
      setLocation(options.redirectPath || "/signin");
    }
  }, [user, loading, options, setLocation]);

  const isAuthenticated = !!user;

  return useMemo(() => ({
    user,
    loading,
    error: null,
    isAuthenticated,
    logout: () => logoutMutation.mutate(),
    refetch: () => refetch(),
  }), [user, loading, logoutMutation, refetch]);
}
