"use client";

import useSWR from "swr";
import CardSkeleton from "@/components/ui/CardSkeleton";
import AverageDaysChartCardClientUI from "./AvarageDaysChartCardClient";
import { fetchAverageDaysBetweenSteps } from "@/features/home/services/dashboardService";
import { AverageDaysStep } from "@/features/home/types";

export default function AverageDaysChartCard() {
  const { data, error, isLoading } = useSWR<AverageDaysStep[]>(
    "/api/applications/statistics/steps/avarage_days",
    fetchAverageDaysBetweenSteps
  );

  if (isLoading) return <CardSkeleton />;
  if (error)
    return (
      <div className="text-red-400 p-6">Failed to load Average Days data.</div>
    );

  return <AverageDaysChartCardClientUI averageDaysData={data!} />;
}
