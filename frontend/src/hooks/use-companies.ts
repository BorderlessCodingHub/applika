"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { services } from "@/services/services";
import { Company } from "@/services/types/applications";

export function useCompanySearch() {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchCompanies = useCallback(
    async (query: string): Promise<Company[]> => {
      setIsLoading(true);
      setError(null);

      const q = query.trim().toLowerCase();

      try {
        const results = await queryClient.fetchQuery({
          queryKey: ["company-search", q],
          queryFn: () => services.companies.searchCompanies(q),
          staleTime: 5 * 60 * 1000,
        });

        return results;
      } catch (err) {
        const e =
          err instanceof Error ? err : new Error("Failed to fetch companies");
        setError(e);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [queryClient],
  );

  return { isLoading, error, fetchCompanies };
}
