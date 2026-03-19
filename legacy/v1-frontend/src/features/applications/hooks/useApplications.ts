import useSWR, { mutate } from "swr";
import type { Application } from "../types";
import { fetchApplications } from "../services/applicationsService";

const fetcherApplications = async (): Promise<Application[]> => {
  return await fetchApplications();
};

export function useApplications() {
  const { data, error, isLoading, isValidating } = useSWR<Application[]>(
    "/api/applications",
    fetcherApplications
  );

  return {
    applications: data || [],
    isLoading,
    isValidating,
    error,
  };
}

export async function mutateApplications() {
  await mutate("/api/applications");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("applications:updated"));
  }
}
