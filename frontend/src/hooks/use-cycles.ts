"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { services } from "@/services/services";
import type { CreateCyclePayload } from "@/services/types/cycles";

export function useCycles() {
  return useQuery({
    queryKey: ["cycles"],
    queryFn: () => services.cycles.getCycles(),
  });
}

export function useCreateCycle(opts?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCyclePayload) =>
      services.cycles.createCycle(data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cycles"] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["statistics"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      toast.success("New cycle started successfully");
      opts?.onSuccess?.();
    },
    onError: () => toast.error("Failed to create cycle"),
  });
}

export function useDeleteCycle(opts?: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => services.cycles.deleteCycle(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cycles"] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["statistics"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      toast.success("Cycle deleted permanently");
      opts?.onSuccess?.();
    },
    onError: () => toast.error("Failed to delete cycle"),
  });
}
