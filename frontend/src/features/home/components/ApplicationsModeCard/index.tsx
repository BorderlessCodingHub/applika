"use client";

import useSWR from "swr";
import ApplicationModeCardClient from "./ApplicationModeCardClient";
import { fetchApplicationsByMode } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";

function Base({ data }: { data?: any }) {
  const mapped = [
    { mode: "active", count: data?.active ?? 0 },
    { mode: "passive", count: data?.passive ?? 0 },
  ];
  const totalApplications = mapped.reduce((sum, m) => sum + m.count, 0);
  return <ApplicationModeCardClient applicationsByMode={mapped} totalApplications={totalApplications} />;
}

export default function ApplicationModeCard() {
  const { data, error, isLoading } = useSWR("applicationsByMode", fetchApplicationsByMode);
  const Wrapped = withFetchStatus(Base, "Failed to load Application Modes");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
