"use client";

import useSWR from "swr";
import AverageDaysChartCardClientUI from "./AvarageDaysChartCardClient";
import { fetchAverageDaysBetweenSteps } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";

function Base({ data }: { data?: any }) {
  return <AverageDaysChartCardClientUI averageDaysData={data ?? []} />;
}

export default function AverageDaysChartCard() {
  const { data, error, isLoading } = useSWR("/api/applications/statistics/steps/avarage_days", fetchAverageDaysBetweenSteps);
  const Wrapped = withFetchStatus(Base, "Failed to load Average Days");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
