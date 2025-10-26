// src/features/applications/hooks/useApplicationSteps.ts
import { useMemo } from "react";
import useSWR, { mutate } from "swr";
import type { ApplicationStep } from "../schemas/applicationsStepsSchema";
import { fetchApplicationSteps } from "../services/applicationStepsService";

function stepsSWRKey(applicationId: string | number) {
  return ["applications/steps", String(applicationId)];
}

async function fetcher([, applicationId]: [string, string]): Promise<
  ApplicationStep[]
> {
  return fetchApplicationSteps(applicationId);
}

export function useApplicationSteps(applicationId?: string | number) {
  // 🧠 create stable key memoized
  const key = useMemo(() => {
    if (!applicationId) return null;
    return stepsSWRKey(applicationId);
  }, [applicationId]);

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: localMutate,
  } = useSWR<ApplicationStep[]>(key, key ? fetcher : null, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return {
    steps: data ?? [],
    isLoading,
    isValidating,
    error,
    mutate: localMutate,
  } as const;
}

export async function mutateSteps(applicationId: string | number) {
  await mutate(stepsSWRKey(applicationId));
}
