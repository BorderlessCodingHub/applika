"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";

export function useApplicationSteps(applicationId: string, enabled = true) {
  const queryClient = useQueryClient();
  const queryKey = ["applications", applicationId, "steps"];

  const query = useQuery({
    queryKey,
    queryFn: () => services.applications.getApplicationSteps(applicationId),
    enabled,
  });

  const addMutation = useMutation({
    mutationFn: (data: {
      step_id: string;
      step_date: string;
      observation?: string;
    }) => services.applications.addStep(applicationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Step added");
    },
    onError: () => toast.error("Failed to add step"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      stepId,
      data,
    }: {
      stepId: string;
      data: { step_id: string; step_date: string; observation?: string };
    }) => services.applications.updateStep(applicationId, stepId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Step updated");
    },
    onError: () => toast.error("Failed to update step"),
  });

  const deleteMutation = useMutation({
    mutationFn: (stepId: string) =>
      services.applications.deleteStep(applicationId, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Step deleted");
    },
    onError: () => toast.error("Failed to delete step"),
  });

  return {
    steps: query.data ?? [],
    isLoading: query.isLoading,
    addMutation,
    updateMutation,
    deleteMutation,
  };
}
