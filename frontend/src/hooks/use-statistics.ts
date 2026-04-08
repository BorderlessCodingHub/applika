"use client";

import { useQuery } from "@tanstack/react-query";
import { services } from "@/services/services";

export function useGeneralStats(cycleId?: string | null) {
  return useQuery({
    queryKey: ["statistics", "general", cycleId ?? "current"],
    queryFn: () => services.statistics.getGeneralStats(cycleId),
  });
}

export function useTrends(cycleId?: string | null) {
  return useQuery({
    queryKey: ["statistics", "trends", cycleId ?? "current"],
    queryFn: () => services.statistics.getTrends(cycleId),
  });
}

export function useStepConversion(cycleId?: string | null) {
  return useQuery({
    queryKey: ["statistics", "conversion", cycleId ?? "current"],
    queryFn: () => services.statistics.getStepConversion(cycleId),
  });
}

export function useStepAvgDays(cycleId?: string | null) {
  return useQuery({
    queryKey: ["statistics", "avgDays", cycleId ?? "current"],
    queryFn: () => services.statistics.getStepAvgDays(cycleId),
  });
}

export function usePlatformStats(cycleId?: string | null) {
  return useQuery({
    queryKey: ["statistics", "platforms", cycleId ?? "current"],
    queryFn: () => services.statistics.getPlatformStats(cycleId),
  });
}

export function useModeStats(cycleId?: string | null) {
  return useQuery({
    queryKey: ["statistics", "mode", cycleId ?? "current"],
    queryFn: () => services.statistics.getModeStats(cycleId),
  });
}
