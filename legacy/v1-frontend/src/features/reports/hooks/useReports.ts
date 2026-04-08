import useSWR, { mutate } from "swr";
import type { ReportsResponse } from "../types/report.types";
import { fetchReports } from "../services/reportsService";

const fetcherReports = async (): Promise<ReportsResponse> => {
  return await fetchReports();
};

export function useReports() {
  const { data, error, isLoading, isValidating } = useSWR<ReportsResponse>(
    "/api/reports",
    fetcherReports
  );

  return {
    reports: data?.reports || [],
    currentDay: data?.current_day || 0,
    currentPhase: data?.current_phase || 0,
    startDate: data?.start_date || "",
    isLoading,
    isValidating,
    error,
  };
}

export async function mutateReports() {
  await mutate("/api/reports");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("reports:updated"));
  }
}
