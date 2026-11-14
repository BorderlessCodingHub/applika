"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { services } from "@/services/services";
import type {
  JobSearchCreate,
  JobSearchUpdate,
} from "@/services/types/job-searches";

/**
 * Saved job searches (R-031/R-032). The mutations raise no toast: the
 * saved-searches menu shows a 409 `detail` inline in its dialog.
 */
export const JOB_SEARCHES_QUERY_KEY = ["job-searches"] as const;

export function useJobSearches() {
  return useQuery({
    queryKey: JOB_SEARCHES_QUERY_KEY,
    queryFn: () => services.jobSearches.list(),
  });
}

function useInvalidateJobSearches() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: JOB_SEARCHES_QUERY_KEY });
}

export function useCreateJobSearch() {
  const invalidate = useInvalidateJobSearches();
  return useMutation({
    mutationFn: (data: JobSearchCreate) => services.jobSearches.create(data),
    onSuccess: invalidate,
  });
}

export function useUpdateJobSearch() {
  const invalidate = useInvalidateJobSearches();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: JobSearchUpdate }) =>
      services.jobSearches.update(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteJobSearch() {
  const invalidate = useInvalidateJobSearches();
  return useMutation({
    mutationFn: (id: string) => services.jobSearches.remove(id),
    onSuccess: invalidate,
  });
}
