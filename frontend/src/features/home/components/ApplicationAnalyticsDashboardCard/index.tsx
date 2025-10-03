"use client";

import { useEffect, useState } from "react";
import ApplicationAnalyticsDashboardClientUI from "./ApplicationAnalyticsDashboardCardClient";
import { ApplicationsStatistics } from "@/features/home/types";

export default function ApplicationAnalyticsDashboardClient() {
  const [stats, setStats] = useState<ApplicationsStatistics | null>(null);

  useEffect(() => {
    fetch("/api/stats", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((data: ApplicationsStatistics) => setStats(data))
      .catch(console.error);
  }, []);

  if (!stats) return <div>Loading...</div>;

  return <ApplicationAnalyticsDashboardClientUI stats={stats} />;
}
