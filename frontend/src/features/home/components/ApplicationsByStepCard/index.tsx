"use client";

import useSWR from "swr";
import CardSkeleton from "@/components/ui/CardSkeleton";
import ApplicationsByStepCardClientUI from "./ApplicationsByStepCardClient";
import { fetchApplicationsByStep } from "@/features/home/services/dashboardService";
import { StepConversionRate } from "@/features/home/types";

export default function ApplicationsByStepCard() {
  const { data, error, isLoading } = useSWR<StepConversionRate[]>(
    "/api/applications/statistics/steps/conversion_rate",
    fetchApplicationsByStep
  );

  if (isLoading) return <CardSkeleton />;
  if (error)
    return (
      <div className="text-red-400 p-6">
        Failed to load Applications by Step.
      </div>
    );

  return <ApplicationsByStepCardClientUI conversionData={data!} />;
}
