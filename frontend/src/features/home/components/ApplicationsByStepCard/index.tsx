"use client";

import { useEffect, useState } from "react";
import ApplicationsByStepCardClientUI from "./ApplicationsByStepCardClient";
import { StepConversionRate } from "@/features/home/types";

export default function ApplicationsByStepCardClient() {
  const [conversionData, setConversionData] = useState<StepConversionRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchConversionData() {
      try {
        const res = await fetch("/api/applications/statistics/steps/conversion_rate", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const data: StepConversionRate[] = await res.json();
        setConversionData(data);
      } catch (err) {
        console.error("Error fetching conversion data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchConversionData();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70">Loading Applications by Step...</div>;
  }

  return <ApplicationsByStepCardClientUI conversionData={conversionData} />;
}
