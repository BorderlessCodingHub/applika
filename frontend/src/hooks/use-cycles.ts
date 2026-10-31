"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { word } from "@/i18n/translator";
import { services } from "@/services/services";
import { rateLimitNotice } from "@/lib/rate-limit";
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
    mutationFn: (data: CreateCyclePayload) => services.cycles.createCycle(data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cycles"] }),
        queryClient.invalidateQueries({ queryKey: ["applications"] }),
        queryClient.invalidateQueries({ queryKey: ["statistics"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
      ]);
      toast.success(word("cycles.toast.created"));
      opts?.onSuccess?.();
    },
    onError: (error) =>
      toast.error(rateLimitNotice(error) ?? word("cycles.toast.createFailed")),
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
      toast.success(word("cycles.toast.deleted"));
      opts?.onSuccess?.();
    },
    onError: (error) =>
      toast.error(rateLimitNotice(error) ?? word("cycles.toast.deleteFailed")),
  });
}
