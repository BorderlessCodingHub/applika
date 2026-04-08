"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { services } from "@/services/services";
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

  const supports = useMemo(() => {
    if (!data) return undefined;
    return {
      ...data,
      platforms: [...data.platforms].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    };
  }, [data]);

  return (
    <SupportsContext.Provider value={{ supports, isLoading }}>
      {children}
    </SupportsContext.Provider>
  );
}
