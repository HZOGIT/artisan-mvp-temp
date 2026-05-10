import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Query current user
  const { data: user, isLoading: loading } = trpc.auth.me.useQuery();

  // Logout mutation
  // Without clearing the React Query cache, auth.me keeps returning the old
  // user (staleTime is 5 min), so isAuthenticated stays true and the UI never
  // updates — the original symptom of "rien ne se passe".
  const logoutMutation = trpc.auth.logout.useMutation({
    onSettled: () => {
      queryClient.clear();
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
    refresh: () => {
      // Invalidate the query to refetch
      return Promise.resolve();
    },
  }), [user, loading, logoutMutation]);
}
