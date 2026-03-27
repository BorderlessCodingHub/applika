"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { User } from "@/services/types/users";
import { useUserProfile } from "@/hooks/use-user";
import { services } from "@/services/services";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useUserProfile();

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
        isAuthenticated: !!user && !isError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
