import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const [location, setLocation] = useLocation();
  
  // Query current user
  const { data: user, isLoading: loading } = trpc.auth.me.useQuery();
  
  // Logout mutation
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setLocation("/");
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
