import useSWR, { mutate } from "swr";
import type { ApplicationStep } from "../schemas/applicationsStepsSchema";
import { fetchApplicationSteps } from "../services/applicationStepsService";

const fetcherSteps = async (appId: string | number): Promise<ApplicationStep[]> => {
  const data = await fetchApplicationSteps(appId);
  return data;
};

export function useApplicationSteps(applicationId?: string | number) {
  const shouldFetch = Boolean(applicationId);

  const { data, error, isLoading, isValidating } = useSWR<ApplicationStep[]>(
    shouldFetch ? `/api/applications/${applicationId}/steps` : null,
    applicationId ? () => fetcherSteps(applicationId) : null
  );

  return {
    steps: data || [],
    isLoading,
    isValidating,
    error,
  };
}

export async function mutateSteps(applicationId: string | number) {
  await mutate(`/api/applications/${applicationId}/steps`);
}
