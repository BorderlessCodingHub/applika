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
  AdminUpdateUser,
  AdminUsersParams,
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

// ── Supports: Platforms ─────────────────────────────────────────────

export function useAdminPlatforms() {
  return useQuery({
    queryKey: ["admin", "platforms"],
    queryFn: () => services.admin.getPlatforms(),
    staleTime: 60_000,
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

// ── Supports: Step Definitions ──────────────────────────────────────

export function useAdminStepDefinitions() {
  return useQuery({
    queryKey: ["admin", "step-definitions"],
    queryFn: () => services.admin.getStepDefinitions(),
    staleTime: 60_000,
  });
}

export function useCreateAdminStepDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color: string; strict: boolean }) =>
      services.admin.createStepDefinition(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "step-definitions"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Step definition created");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useUpdateAdminStepDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; color?: string; strict?: boolean };
    }) => services.admin.updateStepDefinition(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "step-definitions"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Step definition updated");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useDeleteAdminStepDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.admin.deleteStepDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "step-definitions"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Step definition deleted");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

// ── Supports: Feedback Definitions ──────────────────────────────────

export function useAdminFeedbackDefinitions() {
  return useQuery({
    queryKey: ["admin", "feedback-definitions"],
    queryFn: () => services.admin.getFeedbackDefinitions(),
    staleTime: 60_000,
  });
}

export function useCreateAdminFeedbackDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      services.admin.createFeedbackDefinition(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "feedback-definitions"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Feedback definition created");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useUpdateAdminFeedbackDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; color?: string };
    }) => services.admin.updateFeedbackDefinition(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "feedback-definitions"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Feedback definition updated");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}

export function useDeleteAdminFeedbackDefinition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.admin.deleteFeedbackDefinition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "feedback-definitions"] });
      qc.invalidateQueries({ queryKey: ["supports"] });
      toast.success("Feedback definition deleted");
    },
    onError: (err: AxiosError) => toast.error(getApiError(err)),
  });
}
