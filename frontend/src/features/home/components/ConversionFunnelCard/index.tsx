"use client";

import useSWR from "swr";
import ConversionFunnelCardClientUI from "./ConversionFunnelCardClient";
import CardSkeleton from "@/components/ui/CardSkeleton";
import { StepConversionRate } from "@/features/home/types";
import { fetchApplicationsByStep } from "@/features/home/services/dashboardService";

export default function ConversionFunnelCard() {
  const { data, error, isLoading } = useSWR<StepConversionRate[]>(
    "applicationsByStep",
    fetchApplicationsByStep
  );

  if (isLoading) return <CardSkeleton />;
  if (error)
    return (
      <div className="text-red-400 p-6">
        Failed to load Applications by Step.
      </div>
    );

  return <ConversionFunnelCardClientUI conversionData={data!} />;
}
