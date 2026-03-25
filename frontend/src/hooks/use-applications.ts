"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";
import { useSupports } from "@/contexts/supports-context";
import {
  isAfter,
  isBefore,
  isEqual,
  isWithinInterval,
  parseISO,
} from "date-fns";

export interface ApplicationFilters {
  mode: "all" | "active" | "passive";
  status: "all" | "active" | "finalized";
  search?: string;
  platformId?: string;
  dateRange?: {
    start?: string;
    end?: string;
  };
}

const DEFAULT_FILTERS: ApplicationFilters = {
  mode: "all",
  status: "all",
};

function appDateRange(
  appDate: string,
  interval: {
    start?: string;
    end?: string;
  },
) {
  const date = parseISO(appDate);

  if (interval.start) {
    const startDate = parseISO(interval.start);
    if (isBefore(date, startDate) && !isEqual(date, startDate)) {
      return false;
    }
  }

  if (interval.end) {
    const endDate = parseISO(interval.end);
    if (isAfter(date, endDate) && !isEqual(date, endDate)) {
      return false;
    }
  }

  return true;
}

export function useApplications() {
  const queryClient = useQueryClient();
  const { supports } = useSupports();

  const [filters, setFilters] = useState<ApplicationFilters>(DEFAULT_FILTERS);

  const updateFilter = useCallback(
    <K extends keyof ApplicationFilters>(
      key: K,
      value: ApplicationFilters[K],
    ) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
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
      const companyName = app.company_name || "";
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
        appDateRange(app.application_date, filters.dateRange);

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
