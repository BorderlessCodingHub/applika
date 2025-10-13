"use client";

import useSWR from "swr";
import CardSkeleton from "@/components/ui/CardSkeleton";
import ApplicationsByPlatformCardClient from "./ApplicationsByPlatformCardClient";
import { fetchApplicationsByPlatform } from "@/features/home/services/dashboardService";

export default function ApplicationsByPlatformCard() {
  const { data, error, isLoading } = useSWR(
    "/api/applications/statistics/platforms",
    fetchApplicationsByPlatform
  );

  if (isLoading) return <CardSkeleton />;
  if (error)
    return <div className="text-red-400 p-6">Failed to load data.</div>;

  const totalApplications = data!.reduce(
    (sum, p) => sum + p.total_applications,
    0
  );

  return (
    <ApplicationsByPlatformCardClient
      applicationsByPlatform={data!.map((p) => ({
        platform_name: p.name,
        count: p.total_applications,
      }))}
      totalApplications={totalApplications}
    />
  );
}
