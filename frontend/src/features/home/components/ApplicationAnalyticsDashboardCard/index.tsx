"use client";

import useSWR from "swr";
import ApplicationAnalyticsDashboardClientUI from "./ApplicationAnalyticsDashboardCardClient";
import { fetchApplicationsStatistics } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";

function Base({ data }: { data?: any }) {
  return <ApplicationAnalyticsDashboardClientUI stats={data} />;
}

export default function ApplicationAnalyticsDashboardCard() {
  const { data, error, isLoading } = useSWR("/api/stats", fetchApplicationsStatistics);
  const Wrapped = withFetchStatus(Base, "Failed to load Analytics");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
