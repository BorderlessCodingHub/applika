"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { services } from "@/services/services";
import { ApplicationStepPayload } from "@/services/types/applications";

const buildQueryKey = (applicationId: string) => [
  "applications",
  applicationId,
  "steps",
];

export function useApplicationSteps(applicationId: string, enabled = true) {
  const queryKey = buildQueryKey(applicationId);

  const query = useQuery({
    queryKey,
    queryFn: () => services.applications.getApplicationSteps(applicationId),
    enabled,
  });

  return {
    steps: query.data ?? [],
    isLoading: query.isLoading,
  };
}

interface ApplicationStepMutateProps {
  applicationId: string;
  applicationStepId?: string;
  onSuccess?: () => Promise<void> | void;
}

export function useApplicationStepMutate(props: ApplicationStepMutateProps) {
  const queryClient = useQueryClient();
  const queryKey = buildQueryKey(props.applicationId);

  const mutate = useMutation({
    mutationFn: (payload: ApplicationStepPayload) =>
      props.applicationStepId
        ? services.applications.updateStep(
            props.applicationId,
            props.applicationStepId,
            payload,
          )
        : services.applications.addStep(props.applicationId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      props.applicationStepId
        ? toast.success("Step added")
        : toast.success("Step updated");
      if (props.onSuccess) await props.onSuccess();
    },
    onError: () => toast.error("Failed to add step"),
  });

  async function submit(payload: ApplicationStepPayload) {
    await mutate.mutate(payload);
  }

  return { submit, isPending: mutate.isPending };
}

export function useApplicationStepDelete(props: ApplicationStepMutateProps) {
  const queryClient = useQueryClient();
  const queryKey = buildQueryKey(props.applicationId);

  const mutate = useMutation({
    mutationFn: (stepId: string) =>
      services.applications.deleteStep(props.applicationId, stepId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["applications"] });
      toast.success("Step deleted");
      if (props.onSuccess) await props.onSuccess();
    },
    onError: () => toast.error("Failed to delete step"),
  });

  async function deleteStep(stepId: string) {
    await mutate.mutate(stepId);
  }

  return { deleteStep, isPending: mutate.isPending };
}
