"use client";

import useSWR from "swr";
import ApplicationModeCardClient from "./ApplicationModeCardClient";
import { fetchApplicationsByMode } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";
import type { ModeApplications } from "@/features/home/types";

function Base({ data }: { data?: ModeApplications | null }) {
  const mapped = [
    { mode: "active", count: data?.active ?? 0 },
    { mode: "passive", count: data?.passive ?? 0 },
  ];
  const totalApplications = mapped.reduce((sum, m) => sum + m.count, 0);
  return (
    <ApplicationModeCardClient
      applicationsByMode={mapped}
      totalApplications={totalApplications}
    />
  );
}

export default function ApplicationModeCard() {
  const { data, error, isLoading, mutate } = useSWR<ModeApplications>(
    "/api/applications/statistics/mode",
    fetchApplicationsByMode
  );

  const Wrapped = withFetchStatus(Base, "Failed to load Application Modes");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
