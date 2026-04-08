"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAdminPlatformStats,
  getAdminUsers,
  getUserGrowth,
  getSeniorityBreakdown,
  getSystemHealth,
  getTopPlatforms,
  getActivityHeatmap,
} from "@/lib/admin-mock";

export function useAdminStats() {
  return useQuery({
    queryKey: ["admin", "platform-stats"],
    queryFn: getAdminPlatformStats,
    staleTime: 60_000,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: getAdminUsers,
    staleTime: 60_000,
  });
}

export function useUserGrowth() {
  return useQuery({
    queryKey: ["admin", "user-growth"],
    queryFn: getUserGrowth,
    staleTime: 60_000,
  });
}

export function useSeniorityBreakdown() {
  return useQuery({
    queryKey: ["admin", "seniority"],
    queryFn: getSeniorityBreakdown,
    staleTime: 60_000,
  });
}

export function useSystemHealth() {
  return useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: getSystemHealth,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}

export function useTopPlatforms() {
  return useQuery({
    queryKey: ["admin", "top-platforms"],
    queryFn: getTopPlatforms,
    staleTime: 60_000,
  });
}

export function useActivityHeatmap() {
  return useQuery({
    queryKey: ["admin", "heatmap"],
    queryFn: getActivityHeatmap,
    staleTime: 60_000,
  });
}
