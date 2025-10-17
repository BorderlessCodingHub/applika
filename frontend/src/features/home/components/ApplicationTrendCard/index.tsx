"use client";

import useSWR from "swr";
import ApplicationTrendCardClient from "./ApplicationTrendCardClient";
import { fetchApplicationsTrend } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";

function Base({ data }: { data?: any[] }) {
  const monthlyData = data?.map((t) => ({ month: t.application_date, count: t.total_applications })) ?? [];
  return <ApplicationTrendCardClient monthlyData={monthlyData} />;
}

export default function ApplicationTrendCard() {
  const { data, error, isLoading } = useSWR("applicationsTrend", fetchApplicationsTrend);
  const Wrapped = withFetchStatus(Base, "Failed to load Application Trends");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
