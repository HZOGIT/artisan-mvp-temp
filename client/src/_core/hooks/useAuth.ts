import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  // BYPASS CLERK - Return mock authenticated user
  const logout = useCallback(async () => {
    // Mock logout
    console.log("Logout called (mock)");
  }, []);

  const state = useMemo(() => {
    return {
      user: {
        id: "user-1",
        name: "Utilisateur",
        email: "user@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      loading: false,
      error: null,
      isAuthenticated: true,
    };
  }, []);

  return {
    ...state,
    refresh: () => Promise.resolve(),
    logout,
  };
}
