"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { services } from "@/container/services";
import type { Supports } from "@/services/types/supports";

interface SupportsContextType {
  supports: Supports | undefined;
  isLoading: boolean;
}

const SupportsContext = createContext<SupportsContextType>({
  supports: undefined,
  isLoading: true,
});

export const useSupports = () => useContext(SupportsContext);

export function SupportsProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ["supports"],
    queryFn: () => services.supports.getSupports(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return (
    <SupportsContext.Provider value={{ supports: data, isLoading }}>
      {children}
    </SupportsContext.Provider>
  );
}
