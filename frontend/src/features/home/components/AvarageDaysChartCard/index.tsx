"use client";

import useSWR from "swr";
import AverageDaysChartCardClientUI from "./AvarageDaysChartCardClient";
import { fetchAverageDaysBetweenSteps } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";
import type { AverageDaysStep } from "@/features/home/types";

function Base({ data }: { data?: AverageDaysStep[] | null }) {
  return <AverageDaysChartCardClientUI averageDaysData={data ?? []} />;
}

export default function AverageDaysChartCard() {
  const { data, error, isLoading } = useSWR<AverageDaysStep[]>(
    "/api/applications/statistics/steps/avarage_days",
    fetchAverageDaysBetweenSteps
  );

  const Wrapped = withFetchStatus(Base, "Failed to load Average Days");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
