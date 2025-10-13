"use client";

import useSWR from "swr";
import ApplicationModeCardClient from "./ApplicationModeCardClient";
import CardSkeleton from "@/components/ui/CardSkeleton";
import { ModeApplications } from "../../types";
import { fetchApplicationsByMode } from "@/features/home/services/dashboardService";

type ModeData = { mode: string; count: number };

export default function ApplicationModeCard() {
  const { data, error, isLoading } = useSWR<ModeApplications>(
    "applicationsByMode",
    fetchApplicationsByMode
  );

  if (isLoading) return <CardSkeleton />;
  if (error)
    return (
      <div className="text-red-400 p-6">Failed to load Application Modes.</div>
    );

  const mapped: ModeData[] = [
    { mode: "active", count: data!.active },
    { mode: "passive", count: data!.passive },
  ];

  const totalApplications = mapped.reduce((sum, m) => sum + m.count, 0);

  return (
    <ApplicationModeCardClient
      applicationsByMode={mapped}
      totalApplications={totalApplications}
    />
  );
}
