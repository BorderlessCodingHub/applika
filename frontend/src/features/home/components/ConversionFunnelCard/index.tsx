"use client";

import { useEffect, useState } from "react";
import ConversionFunnelCardClientUI from "./ConversionFunnelCardClient";
import { StepConversionRate } from "@/features/home/types";

export default function ConversionFunnelCardClient() {
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

        // Normalize response if needed
        const mapped: StepConversionRate[] = data.map((step) => ({
          id: step.id,
          name: step.name,
          color: step.color,
          total_applications: step.total_applications,
          conversion_rate: step.conversion_rate,
        }));

        setConversionData(mapped);
      } catch (err) {
        console.error("Error fetching conversion funnel data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchConversionData();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70">Loading Conversion Funnel...</div>;
  }

  return <ConversionFunnelCardClientUI conversionData={conversionData} />;
}
