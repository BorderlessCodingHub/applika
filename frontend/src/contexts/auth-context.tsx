"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@/services/types/users";
import { useUserProfile } from "@/hooks/use-user";
import { services } from "@/services/services";
import { useQuery } from "@tanstack/react-query";

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
    isLoading: isAuthLoading,
    isError: isAuthError,
  } = useQuery({
    queryKey: ["applika-auth"],
    queryFn: () => services.auth.refresh(),
    retry: false,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.error ? DISCONNECTED_INTERVAL : CONNECTED_INTERVAL,
    refetchIntervalInBackground: true,
  });

  const {
    data: user,
    isLoading: isUserLoading,
    isError: isUserError,
  } = useUserProfile(isAuthSuccess);

  const isLoading = isAuthLoading || (isAuthSuccess && isUserLoading);

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
