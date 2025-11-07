"use client";

import useSWR from "swr";
import ConversionFunnelCardClientUI from "./ConversionFunnelCardClient";
import { fetchApplicationsByStep } from "@/features/home/services/dashboardService";
import { withFetchStatus } from "@/components/ui/withFetchStatus";
import type { StepConversionRate } from "@/features/home/types";

function Base({ data }: { data?: StepConversionRate[] | null }) {
  return <ConversionFunnelCardClientUI conversionData={data ?? []} />;
}

export default function ConversionFunnelCard() {
  const { data, error, isLoading } = useSWR<StepConversionRate[]>(
    "/api/applications/statistics/steps/conversion_rate",
    fetchApplicationsByStep
  );

  const Wrapped = withFetchStatus(Base, "Failed to load Conversion Funnel");
  return <Wrapped data={data} isLoading={isLoading} error={error} />;
}
