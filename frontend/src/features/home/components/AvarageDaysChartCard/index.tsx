"use client";

import { useEffect, useState } from "react";
import AverageDaysChartCardClientUI from "./AvarageDaysChartCardClient";
import { AverageDaysStep } from "@/features/home/types";

export default function AverageDaysChartCardClient() {
  const [averageDaysData, setAverageDaysData] = useState<AverageDaysStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAverageDays() {
      try {
        const res = await fetch("/api/applications/statistics/steps/avarage_days", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const data: AverageDaysStep[] = await res.json();
        setAverageDaysData(data);
      } catch (err) {
        console.error("Error fetching average days data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchAverageDays();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70">Loading Average Days Between Steps...</div>;
  }

  return <AverageDaysChartCardClientUI averageDaysData={averageDaysData} />;
}
