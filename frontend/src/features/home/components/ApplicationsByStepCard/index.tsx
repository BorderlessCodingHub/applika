"use client";

import useSWR from "swr";
import ApplicationsByStepCardClientUI from "./ApplicationsByStepCardClient";
import { fetchApplicationsByStep } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";

function Base({ data }: { data?: any }) {
  return <ApplicationsByStepCardClientUI conversionData={data ?? []} />;
}

export default function ApplicationsByStepCard() {
  const { data, error, isLoading } = useSWR("/api/applications/statistics/steps/conversion_rate", fetchApplicationsByStep);
  const Wrapped = withFetchStatus(Base, "Failed to load Applications by Step");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
