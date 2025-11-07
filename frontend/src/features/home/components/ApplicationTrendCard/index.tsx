"use client";

import useSWR from "swr";
import ApplicationTrendCardClient from "./ApplicationTrendCardClient";
import { fetchApplicationsTrend } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";
import type { ApplicationsTrend } from "@/features/home/types";

function Base({ data }: { data?: ApplicationsTrend[] | null }) {
  const monthlyData =
    data?.map((t) => ({
      month: t.application_date,
      count: t.total_applications,
    })) ?? [];
  return <ApplicationTrendCardClient monthlyData={monthlyData} />;
}

export default function ApplicationTrendCard() {
  const { data, error, isLoading } = useSWR<ApplicationsTrend[]>(
    "/api/applications/statistics/trends",
    fetchApplicationsTrend
  );

  const Wrapped = withFetchStatus(Base, "Failed to load Application Trends");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
