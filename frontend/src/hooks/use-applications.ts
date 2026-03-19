"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/container/services";
import { useSupports } from "@/contexts/supports-context";

export interface ApplicationFilters {
  mode: "all" | "active" | "passive";
  status: "all" | "active" | "finalized";
  search?: string;
  platformId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

const DEFAULT_FILTERS: ApplicationFilters = {
  mode: "all",
  status: "all",
};

export function useApplications() {
  const queryClient = useQueryClient();
  const { supports } = useSupports();

  const [filters, setFilters] = useState<ApplicationFilters>(DEFAULT_FILTERS);

  const updateFilter = useCallback(
    <K extends keyof ApplicationFilters>(
      key: K,
      value: ApplicationFilters[K]
    ) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const query = useQuery({
    queryKey: ["applications"],
    queryFn: () => services.applications.getApplications(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => services.applications.deleteApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  const hasAdvancedFilters =
    filters.status !== "all" ||
    filters.platformId != null ||
    filters.dateRange != null;

  const hasAnyFilter =
    !!filters.search || filters.mode !== "all" || hasAdvancedFilters;

  const filtered = useMemo(() => {
    if (!query.data) return [];
    return query.data.filter((app) => {
      const companyName = app.company?.name || app.old_company || "";
      const matchSearch =
        !filters.search ||
        companyName.toLowerCase().includes(filters.search.toLowerCase()) ||
        app.role.toLowerCase().includes(filters.search.toLowerCase());
      const matchMode = filters.mode === "all" || app.mode === filters.mode;
      const matchStatus =
        filters.status === "all" ||
        (filters.status === "finalized" ? app.finalized : !app.finalized);
      const matchPlatform =
        filters.platformId == null || app.platform_id === filters.platformId;
      const matchDateRange =
        !filters.dateRange ||
        (() => {
          const appDate = new Date(app.application_date + "T00:00:00");
          return (
            appDate >= filters.dateRange.start &&
            appDate <= filters.dateRange.end
          );
        })();

      return (
        matchSearch &&
        matchMode &&
        matchStatus &&
        matchPlatform &&
        matchDateRange
      );
    });
  }, [query.data, filters]);

  const getPlatformName = (id: string) =>
    supports?.platforms.find((p) => p.id === id)?.name ?? String(id);

  return {
    filtered,
    isLoading: query.isLoading,
    filters,
    updateFilter,
    clearFilters,
    hasAdvancedFilters,
    hasAnyFilter,
    deleteMutation,
    getPlatformName,
    supports,
  };
}
