"use client";

import { useQuery } from "@tanstack/react-query";
import { services } from "@/services/services";

export function useGeneralStats() {
  return useQuery({
    queryKey: ["statistics", "general"],
    queryFn: () => services.statistics.getGeneralStats(),
  });
}

export function useTrends() {
  return useQuery({
    queryKey: ["statistics", "trends"],
    queryFn: () => services.statistics.getTrends(),
  });
}

export function useStepConversion() {
  return useQuery({
    queryKey: ["statistics", "conversion"],
    queryFn: () => services.statistics.getStepConversion(),
  });
}

export function useStepAvgDays() {
  return useQuery({
    queryKey: ["statistics", "avgDays"],
    queryFn: () => services.statistics.getStepAvgDays(),
  });
}

export function usePlatformStats() {
  return useQuery({
    queryKey: ["statistics", "platforms"],
    queryFn: () => services.statistics.getPlatformStats(),
  });
}

export function useModeStats() {
  return useQuery({
    queryKey: ["statistics", "mode"],
    queryFn: () => services.statistics.getModeStats(),
  });
}
