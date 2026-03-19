"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { services } from "@/container/services";

export function useCompanySearch(search: string) {
  return useQuery({
    queryKey: ["company-search", search],
    queryFn: () => services.companies.searchCompanies(search),
    enabled: search.length >= 2,
    staleTime: 30_000,
    gcTime: 60_000,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, url }: { name: string; url?: string }) =>
      services.companies.createCompany(name, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-search"] });
    },
  });
}
