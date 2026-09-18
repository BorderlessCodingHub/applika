"use client";

import { useQuery } from "@tanstack/react-query";

import { BASE_CVS_QUERY_KEY } from "@/hooks/use-base-cvs";
import { services } from "@/services/services";

/**
 * One master CV by id. Idle until an id is known — the edit route reads it from
 * `?id=`, which is `null` on the first client frame.
 */
export function useBaseCv(id: string | null | undefined) {
  return useQuery({
    queryKey: [...BASE_CVS_QUERY_KEY, id],
    queryFn: () => services.baseCvs.get(id as string),
    enabled: Boolean(id),
  });
}
