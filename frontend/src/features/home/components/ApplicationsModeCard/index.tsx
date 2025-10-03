"use client";

import { useEffect, useState } from "react";
import ApplicationModeCardClient from "./ApplicationModeCardClient";
import { ModeApplications } from "../../types";

type ModeData = {
  mode: string;
  count: number;
};

export default function ApplicationModeCard() {
  const [modesData, setModesData] = useState<ModeData[]>([]);
  const [totalApplications, setTotalApplications] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchModes() {
      try {
        const res = await fetch("/api/applications/statistics/mode", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch mode data");
        const data: ModeApplications = await res.json();

        const mapped: ModeData[] = [
          { mode: "active", count: data.active },
          { mode: "passive", count: data.passive },
        ];

        const total = mapped.reduce((sum, m) => sum + m.count, 0);

        setModesData(mapped);
        setTotalApplications(total);
      } catch (err) {
        console.error("Error fetching application modes:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchModes();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70">Loading Application Modes...</div>;
  }

  return <ApplicationModeCardClient applicationsByMode={modesData} totalApplications={totalApplications} />;
}
