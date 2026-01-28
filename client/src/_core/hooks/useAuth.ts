import { useAuth as useClerkAuth, useClerk } from "@clerk/clerk-react";
import { useCallback, useMemo } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false } = options ?? {};
  const { userId, user, isLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();

  const logout = useCallback(async () => {
    await signOut({ redirectUrl: "/" });
  }, [signOut]);

  const state = useMemo(() => {
    if (!isLoaded) {
      return {
        user: null,
        loading: true,
        error: null,
        isAuthenticated: false,
      };
    }

    return {
      user: user
        ? {
            id: userId || "",
            name: user.fullName || "",
            email: user.primaryEmailAddress?.emailAddress || "",
            createdAt: new Date(user.createdAt || Date.now()),
            updatedAt: new Date(user.updatedAt || Date.now()),
          }
        : null,
      loading: !isLoaded,
      error: null,
      isAuthenticated: isSignedIn || false,
    };
  }, [isLoaded, isSignedIn, user, userId]);

  return {
    ...state,
    refresh: () => Promise.resolve(),
    logout,
  };
}
