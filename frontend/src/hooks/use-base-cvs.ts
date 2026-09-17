"use client";

import { useQuery } from "@tanstack/react-query";

import { services } from "@/services/services";

/** Root cache key for every master CV query. Invalidate it after any write. */
export const BASE_CVS_QUERY_KEY = ["base-cvs"] as const;

/** The signed-in user's master CVs. */
export function useBaseCvs() {
  return useQuery({
    queryKey: BASE_CVS_QUERY_KEY,
    queryFn: () => services.baseCvs.list(),
  });
}
