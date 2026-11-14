"use client";

import { useQuery } from "@tanstack/react-query";

import { useHasFeature } from "@/hooks/use-features";
import { services } from "@/services/services";

/** Root cache key for every master CV query. Invalidate it after any write. */
export const BASE_CVS_QUERY_KEY = ["base-cvs"] as const;

/**
 * The signed-in user's master CVs. Runs only with the `cvs` feature: without
 * it the API answers 404, so the query stays idle (`isSuccess` false, no data)
 * and the job board shows neither fit nor the master CV invitation.
 */
export function useBaseCvs() {
  const { has } = useHasFeature("cvs");
  return useQuery({
    queryKey: BASE_CVS_QUERY_KEY,
    queryFn: () => services.baseCvs.list(),
    enabled: has,
  });
}
