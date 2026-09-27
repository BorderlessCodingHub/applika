"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { services } from "@/services/services";
import { Company } from "@/services/types/applications";

/**
 * Debounced-search wrapper the company picker calls with every query,
 * including `""` (KODI-035): a blank query hits `GET /companies` with no
 * `name` param, i.e. every visible company, so the picker can list them on
 * open (AC1) — the cache key `["company-search", ""]` is the "list" case,
 * narrower queries are the "search" case, and `useCreateCompany`'s
 * `invalidateQueries({queryKey: ["company-search"]})` covers both since it
 * matches by prefix.
 */
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
