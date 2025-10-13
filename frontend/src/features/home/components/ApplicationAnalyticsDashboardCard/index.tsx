"use client";

import useSWR from "swr";
import CardSkeleton from "@/components/ui/CardSkeleton";
import ApplicationAnalyticsDashboardClientUI from "./ApplicationAnalyticsDashboardCardClient";
import { fetchApplicationsStatistics } from "@/features/home/services/dashboardService";
import { ApplicationsStatistics } from "@/features/home/types";

export default function ApplicationAnalyticsDashboardClient() {
  const { data, error, isLoading } = useSWR<ApplicationsStatistics>(
    "/api/stats",
    fetchApplicationsStatistics
  );

  if (isLoading) return <CardSkeleton />;
  if (error)
    return <div className="text-red-400 p-6">Failed to load data.</div>;

  return <ApplicationAnalyticsDashboardClientUI stats={data!} />;
}
