"use client";

import useSWR from "swr";
import ApplicationAnalyticsDashboardClientUI from "./ApplicationAnalyticsDashboardCardClient";
import { fetchApplicationsStatistics } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";
import type { ApplicationsStatistics } from "@/features/home/types";

function Base({ data }: { data?: ApplicationsStatistics | null }) {
  return (
    <ApplicationAnalyticsDashboardClientUI
      stats={data ?? ({} as ApplicationsStatistics)}
    />
  );
}

export default function ApplicationAnalyticsDashboardCard() {
  const { data, error, isLoading } = useSWR<ApplicationsStatistics>(
    "/api/stats",
    fetchApplicationsStatistics
  );

  const Wrapped = withFetchStatus(Base, "Failed to load Analytics");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
