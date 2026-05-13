"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";
import type { JobFilters } from "@/services/types/jobs";

export interface JobsFilters {
  source?: string;
  search?: string;
  minFit?: number;
  sort?: "newest" | "oldest" | "best_fit";
  page?: number;
}

const DEFAULT_FILTERS: JobsFilters = {
  sort: "newest",
  page: 1,
};

export function useJobs() {
  const [filters, setFilters] = useState<JobsFilters>(DEFAULT_FILTERS);

  const updateFilter = useCallback(
    <K extends keyof JobsFilters>(key: K, value: JobsFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
    },
    [],
  );

  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const apiFilters: JobFilters = {
    source: filters.source,
    search: filters.search,
    min_fit: filters.minFit,
    sort: filters.sort,
    page: filters.page ?? 1,
  };

  const query = useQuery({
    queryKey: ["jobs", filters],
    queryFn: () => services.jobs.getJobs(apiFilters),
  });

  return {
    jobs: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? 1,
    pageSize: query.data?.page_size ?? 20,
    isLoading: query.isLoading,
    filters,
    updateFilter,
    clearFilters,
  };
}

export function useJobDetail(jobId: string | null) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => services.jobs.getJob(jobId!),
    enabled: !!jobId,
  });
}

export function useCreateApplicationFromJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      services.jobs.createApplicationFromJob(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application created");
    },
    onError: () => toast.error("Failed to create application"),
  });
}

export function useTailorCv(jobId: string | null) {
  return useMutation({
    mutationFn: () => services.jobs.tailorCv(jobId!),
    onError: () => toast.error("CV tailoring failed"),
  });
}

export function useRefreshFit() {
  return useMutation({
    mutationFn: () => services.jobs.refreshFit(),
    onSuccess: () => toast.success("Fit scores refresh scheduled"),
    onError: () => toast.error("Failed to schedule fit refresh"),
  });
}
