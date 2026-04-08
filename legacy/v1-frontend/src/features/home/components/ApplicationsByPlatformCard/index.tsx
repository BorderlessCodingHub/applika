"use client";

import useSWR from "swr";
import ApplicationsByPlatformCardClient from "./ApplicationsByPlatformCardClient";
import { fetchApplicationsByPlatform } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";

type APIPlatform = { id: number; name: string; total_applications: number };

function Base({ data }: { data?: APIPlatform[] | null }) {
  const applications =
    data?.map((p) => ({
      platform_name: p.name,
      count: p.total_applications,
    })) ?? [];
  const totalApplications = applications.reduce((sum, p) => sum + p.count, 0);
  return (
    <ApplicationsByPlatformCardClient
      applicationsByPlatform={applications}
      totalApplications={totalApplications}
    />
  );
}

export default function ApplicationsByPlatformCard() {
  const { data, error, isLoading } = useSWR<APIPlatform[]>(
    "/api/applications/statistics/platforms",
    fetchApplicationsByPlatform
  );

  const Wrapped = withFetchStatus(
    Base,
    "Failed to load Applications by Platform"
  );
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
