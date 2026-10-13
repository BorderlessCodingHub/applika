"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AxiosError } from "axios";
import { toast } from "sonner";

import { getApiError } from "@/lib/api-client";
import { services } from "@/services/services";
import type {
  AdminCompaniesParams,
  AdminPlatformsParams,
  AdminUpdateUser,
  AdminJobSource,
  AdminUsersParams,
  CreateDiscordWebhook,
  UpdateDiscordWebhook,
} from "@/services/types/admin";

// ── Dashboard Analytics ─────────────────────────────────────────────

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "platform-stats"],
    queryFn: () => services.admin.getStats(),
    staleTime: 60_000,
  });
}

export function useAdminUsers(params?: AdminUsersParams) {
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () => services.admin.getUsers(params),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useUserGrowth() {
  return useQuery({
    queryKey: ["admin", "user-growth"],
    queryFn: () => services.admin.getUserGrowth(),
    staleTime: 60_000,
  });
}

export function useSeniorityBreakdown() {
  return useQuery({
    queryKey: ["admin", "seniority"],
    queryFn: () => services.admin.getSeniorityBreakdown(),
    staleTime: 60_000,
  });
}

export function useTopPlatforms() {
  return useQuery({
    queryKey: ["admin", "top-platforms"],
    queryFn: () => services.admin.getTopPlatforms(),
    staleTime: 60_000,
  });
}

export function useTopCompanies() {
  return useQuery({
    queryKey: ["admin", "top-companies"],
    queryFn: () => services.admin.getTopCompanies(),
    staleTime: 60_000,
  });
}

export function useActivityHeatmap() {
  return useQuery({
    queryKey: ["admin", "heatmap"],
    queryFn: () => services.admin.getActivityHeatmap(),
    staleTime: 60_000,
  });
}

// ── User Management ─────────────────────────────────────────────────

export function useAdminUserDetail(id: string) {
  return useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => services.admin.getUser(id),
    enabled: !!id,
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdminUpdateUser }) =>
      services.admin.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      qc.invalidateQueries({ queryKey: ["admin", "user"] });
      qc.invalidateQueries({ queryKey: ["admin", "platform-stats"] });
      toast.success("User updated");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

// ── Company Management ──────────────────────────────────────────────

export function useAdminCompanies(params?: AdminCompaniesParams) {
  return useQuery({
    queryKey: ["admin", "companies", params],
    queryFn: () => services.admin.getCompanies(params),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useCreateAdminCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url: string }) =>
      services.admin.createCompany(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "companies"] });
      toast.success("Company created");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useUpdateAdminCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; url?: string; is_active?: boolean };
    }) => services.admin.updateCompany(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "companies"] });
      toast.success("Company updated");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useDeleteAdminCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.admin.deleteCompany(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "companies"] });
      toast.success("Company deleted");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

/**
 * Publish a private company (PRD 0010, AC19/AC20). Deliberately raises NO
 * toast on error — `ApproveCatalogButton` shows the 409/404 `detail` verbatim
 * inside its own dialog, which a toast would duplicate or race.
 */
export function usePublishCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.admin.publishCompany(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "companies"] });
    },
  });
}

// ── Supports: Platforms ─────────────────────────────────────────────

export function useAdminPlatforms(params?: AdminPlatformsParams) {
  return useQuery({
    queryKey: ["admin", "platforms", params],
    queryFn: () => services.admin.getPlatforms(params),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Publish a private platform (PRD 0010, AC19/AC20). See `usePublishCompany`. */
export function usePublishPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.admin.publishPlatform(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "platforms"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
    },
  });
}

export function useCreateAdminPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; url?: string }) =>
      services.admin.createPlatform(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "platforms"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Platform created");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useUpdateAdminPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name: string; url?: string };
    }) => services.admin.updatePlatform(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "platforms"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Platform updated");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useDeleteAdminPlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.admin.deletePlatform(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "platforms"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Platform deleted");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

// Step/feedback definition hooks removed (PRD 0008, ADR 0012, R-021): admins
// can no longer create, edit or delete step or feedback definitions.

// ── Report webhooks (KODI-027) ──────────────────────────────────────────

const DISCORD_WEBHOOKS_KEY = ["admin", "discord-webhooks"] as const;

export function useAdminDiscordWebhooks() {
  return useQuery({
    queryKey: DISCORD_WEBHOOKS_KEY,
    queryFn: () => services.admin.getDiscordWebhooks(),
    staleTime: 60_000,
  });
}

export function useCreateDiscordWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDiscordWebhook) =>
      services.admin.createDiscordWebhook(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DISCORD_WEBHOOKS_KEY });
      toast.success("Webhook added");
    },
  });
}

export function useUpdateDiscordWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDiscordWebhook }) =>
      services.admin.updateDiscordWebhook(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DISCORD_WEBHOOKS_KEY });
      toast.success("Webhook updated");
    },
  });
}

export function useDeleteDiscordWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.admin.deleteDiscordWebhook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: DISCORD_WEBHOOKS_KEY });
      toast.success("Webhook deleted");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

// ── Job sources (KODI-049, R-033..R-035) ────────────────────────────────

export const ADMIN_JOB_SOURCES_KEY = ["admin", "job-sources"] as const;

/**
 * `GET /admin/jobs/sources`. `refetchInterval` is the caller's: the page polls
 * for a bounded while after a run starts, because the API has no "running" state.
 */
export function useAdminJobSources(opts?: {
  refetchInterval?: number | false;
}) {
  return useQuery({
    queryKey: ADMIN_JOB_SOURCES_KEY,
    queryFn: () => services.admin.getJobSources(),
    refetchInterval: opts?.refetchInterval ?? false,
  });
}

/**
 * `PATCH /admin/jobs/sources/{id}` (R-034). Optimistic: the switch shows the
 * requested value at once and rolls back, with the server's `detail` in a
 * toast, when the PATCH fails.
 */
export function useUpdateAdminJobSource() {
  const qc = useQueryClient();
  return useMutation<
    AdminJobSource,
    AxiosError,
    { id: string; is_enabled: boolean },
    { previous: AdminJobSource | undefined }
  >({
    mutationFn: ({ id, is_enabled }) =>
      services.admin.updateJobSource(id, { is_enabled }),
    onMutate: async ({ id, is_enabled }) => {
      await qc.cancelQueries({ queryKey: ADMIN_JOB_SOURCES_KEY });
      const previous = qc
        .getQueryData<AdminJobSource[]>(ADMIN_JOB_SOURCES_KEY)
        ?.find((row) => row.id === id);
      qc.setQueryData<AdminJobSource[]>(ADMIN_JOB_SOURCES_KEY, (rows) =>
        rows?.map((row) => (row.id === id ? { ...row, is_enabled } : row)),
      );
      return { previous };
    },
    // Rolls back THIS row only: another PATCH in flight keeps its own value.
    onError: (err, { id }, context) => {
      const previous = context?.previous;
      if (previous) {
        qc.setQueryData<AdminJobSource[]>(ADMIN_JOB_SOURCES_KEY, (rows) =>
          rows?.map((row) =>
            row.id === id ? { ...row, is_enabled: previous.is_enabled } : row,
          ),
        );
      }
      toast.error(getApiError(err));
    },
    onSuccess: (row) => {
      qc.setQueryData<AdminJobSource[]>(ADMIN_JOB_SOURCES_KEY, (rows) =>
        rows?.map((item) => (item.id === row.id ? row : item)),
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_JOB_SOURCES_KEY });
    },
  });
}

/**
 * `POST /admin/jobs/runs` (R-035). No toast here: the page toasts the 202 and
 * keeps a 409/503 `detail` on screen as a notice.
 */
export function useStartJobRun() {
  const qc = useQueryClient();
  return useMutation<unknown, AxiosError>({
    mutationFn: () => services.admin.startJobRun(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ADMIN_JOB_SOURCES_KEY });
    },
  });
}
