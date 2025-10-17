"use client";

import useSWR from "swr";
import ConversionFunnelCardClientUI from "./ConversionFunnelCardClient";
import { fetchApplicationsByStep } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";

function Base({ data }: { data?: any }) {
  return <ConversionFunnelCardClientUI conversionData={data ?? []} />;
}

export default function ConversionFunnelCard() {
  const { data, error, isLoading } = useSWR("applicationsByStep", fetchApplicationsByStep);
  const Wrapped = withFetchStatus(Base, "Failed to load Conversion Funnel");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
