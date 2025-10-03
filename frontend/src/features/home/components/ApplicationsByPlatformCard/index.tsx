"use client";

import { useEffect, useState } from "react";
import ApplicationsByPlatformCardClient from "./ApplicationsByPlatformCardClient";
import { PlatformApplications } from "../../types";

export default function ApplicationsByPlatformCard() {
  const [platformApplicationsData, setPlatformApplicationsData] = useState<PlatformApplications[]>([]);
  const [totalApplications, setTotalApplications] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlatformApplications() {
      try {
        const res = await fetch("/api/applications/statistics/platforms", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch");
        const data: PlatformApplications[] = await res.json();

        setPlatformApplicationsData(data);

        const total = data.reduce((sum, p) => sum + p.total_applications, 0);
        setTotalApplications(total);
      } catch (err) {
        console.error("Error fetching platform applications data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPlatformApplications();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70">Loading Applications by Platform...</div>;
  }

  return (
    <ApplicationsByPlatformCardClient
      applicationsByPlatform={platformApplicationsData.map((p) => ({
        platform_name: p.name,
        count: p.total_applications,
      }))}
      totalApplications={totalApplications}
    />
  );
}
