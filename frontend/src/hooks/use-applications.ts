"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { isAfter, isBefore, isEqual, parseISO } from "date-fns";
import { AxiosError } from "axios";
import { services } from "@/services/services";
import { useSupports } from "@/contexts/supports-context";
import {
  ApplicationFinalizePayload,
  CreateApplicationPayload,
} from "@/services/types/applications";
import { getApiError } from "@/lib/api-client";

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

export function useApplications(cycleId?: string | null) {
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
    queryKey: ["applications", cycleId ?? "current"],
    queryFn: () => services.applications.getApplications(cycleId),
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
    getPlatformName,
    supports,
  };
}

/**
 * One application out of the cycle's list, by id.
 *
 * The API has no `GET /applications/{id}`, so the single application is read
 * out of the list — and deliberately under the SAME query key as
 * `useApplications`, so the two share one cache entry and one round trip
 * instead of racing each other.
 *
 * `cycleId` is the cycle currently being viewed (`null` is the open one). An
 * application only appears in the list of the cycle it belongs to, which is
 * also what makes "this one is archived" knowable on the client at all: the
 * wire carries no `cycle_id` per application.
 */
export function useApplicationById(
  applicationId: string | null | undefined,
  cycleId?: string | null,
) {
  const query = useQuery({
    queryKey: ["applications", cycleId ?? "current"],
    queryFn: () => services.applications.getApplications(cycleId),
    // Idle until the route names an application: `?id=` is `null` on the first
    // client frame, and on `/applications/cv` with no id there is nothing to
    // look up at all.
    enabled: Boolean(applicationId),
  });

  const application = useMemo(
    () => query.data?.find((app) => app.id === applicationId) ?? null,
    [query.data, applicationId],
  );

  return {
    application,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

export function useApplicationDelete() {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => services.applications.deleteApplication(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Application deleted");
    },
    onError: () => toast.error("Failed to delete"),
  });

  async function deleteApplication(id: string) {
    await deleteMutation.mutate(id);
  }

  return { deleteApplication };
}

interface ApplicationMutateProps {
  applicationId?: string;
  onSuccess?: () => Promise<void> | void;
}

export function useApplicationMutate(props: ApplicationMutateProps) {
  const queryClient = useQueryClient();

  function mutationFn(data: CreateApplicationPayload) {
    return props.applicationId
      ? services.applications.updateApplication(props.applicationId, data)
      : services.applications.createApplication(data);
  }

  async function onSuccess() {
    await queryClient.invalidateQueries({ queryKey: ["applications"] });
    await queryClient.invalidateQueries({ queryKey: ["statistics"] });
    await queryClient.invalidateQueries({ queryKey: ["company-search"] });
    toast.success(
      props.applicationId ? "Application updated" : "Application created",
    );
    if (props.onSuccess) await props.onSuccess();
  }

  function onError(error: AxiosError) {
    const message = getApiError(error);
    toast.error(message);
  }

  const mutation = useMutation({ mutationFn, onSuccess, onError });

  async function submit(payload: CreateApplicationPayload) {
    await mutation.mutate(payload);
  }

  return {
    submit,
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
  };
}

interface ApplicationFinalizeProps {
  applicationId: string;
  onSuccess?: () => Promise<void> | void;
}

export function useFinalizeApplication(props: ApplicationFinalizeProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: ApplicationFinalizePayload) =>
      services.applications.finalizeApplication(props.applicationId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      await queryClient.invalidateQueries({ queryKey: ["statistics"] });
      toast.success("Application finalized");
      if (props.onSuccess) await props.onSuccess();
    },
    onError: () => toast.error("Failed to finalize"),
  });

  async function finalize(payload: ApplicationFinalizePayload) {
    await mutation.mutate(payload);
  }

  return {
    finalize,
    isPending: mutation.isPending,
    error: mutation.error as Error | null,
  };
}
