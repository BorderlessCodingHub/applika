"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@/services/types/users";
import { useUserProfile } from "@/hooks/use-user";
import { services } from "@/services/services";
import { useQuery } from "@tanstack/react-query";
import { isRateLimited, retryAfterMs } from "@/lib/rate-limit";

interface AuthContextType {
  user: User | null;
  logout: () => Promise<void>;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  logout: () => new Promise(() => {}),
  isAuthenticated: false,
});

export const useAuth = () => useContext(AuthContext);

const CONNECTED_INTERVAL = 10 * 60_000; // 10 minutes
const DISCONNECTED_INTERVAL = 30_000; // 30 seconds on failure

export function AuthProvider({ children }: { children: ReactNode }) {
  const {
    isSuccess: isAuthSuccess,
    // `isPending`, not `isLoading`: while a 429 retry's `retryDelay` sleep
    // ends with the tab hidden, TanStack pauses the retry (`fetchStatus`
    // becomes `"paused"`), and `isLoading` — `isPending && isFetching` —
    // goes false even though the query is still `pending`. `isLoading`
    // would then read as "done, and not authenticated", and the protected
    // layout would redirect to `/login` on a cold load that is merely
    // waiting out its wait in a backgrounded tab. `isPending` alone stays
    // true until the query actually settles.
    isPending: isAuthPending,
    isError: isAuthError,
  } = useQuery({
    queryKey: ["applika-auth"],
    queryFn: () => services.auth.refresh(),
    // A 429 is temporary (R-019/R-024): keep retrying on the server's own
    // wait instead of ever settling into `isError`, which would sign a
    // still-valid session out. Any other error keeps today's behaviour —
    // no retry, straight to `isError`.
    retry: (_failureCount, error) => isRateLimited(error),
    retryDelay: (_failureCount, error) => retryAfterMs(error),
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.error ? DISCONNECTED_INTERVAL : CONNECTED_INTERVAL,
    refetchIntervalInBackground: true,
  });

  const {
    data: user,
    isPending: isUserPending,
    isError: isUserError,
  } = useUserProfile(isAuthSuccess);

  const isLoading = isAuthPending || (isAuthSuccess && isUserPending);

  const handleLogout = async () => {
    try {
      await services.auth.logout();
    } finally {
      window.location.href = "/";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        logout: handleLogout,
        isLoading,
        isAuthenticated: !!user && !isUserError && !isAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
