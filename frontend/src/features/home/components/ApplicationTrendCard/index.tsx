"use client";

import useSWR from "swr";
import ApplicationTrendCardClient from "./ApplicationTrendCardClient";
import CardSkeleton from "@/components/ui/CardSkeleton";
import { ApplicationsTrend } from "../../types";
import { fetchApplicationsTrend } from "@/features/home/services/dashboardService";

export default function ApplicationTrendCard() {
  const { data, error, isLoading } = useSWR<ApplicationsTrend[]>(
    "applicationsTrend",
    fetchApplicationsTrend
  );

  if (isLoading) return <CardSkeleton />;
  if (error)
    return (
      <div className="text-red-400 p-6">Failed to load Application Trends.</div>
    );

  const monthlyData = data!.map((t) => ({
    month: t.application_date,
    count: t.total_applications,
  }));

  return <ApplicationTrendCardClient monthlyData={monthlyData} />;
}
