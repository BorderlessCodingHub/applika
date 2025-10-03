"use client";

import { useEffect, useState } from "react";
import ApplicationTrendCardClient from "./ApplicationTrendCardClient";
import { ApplicationsTrend } from "../../types";

export default function ApplicationTrendCard() {
  const [trends, setTrends] = useState<ApplicationsTrend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrends() {
      try {
        const res = await fetch("/api/applications/statistics/trends", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch trends");
        const data: ApplicationsTrend[] = await res.json();

        setTrends(data);
      } catch (err) {
        console.error("Error fetching application trends:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTrends();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70">Loading Application Trends...</div>;
  }

  const monthlyData = trends.map(t => ({
    month: t.application_date,
    count: t.total_applications
  }));

  return <ApplicationTrendCardClient monthlyData={monthlyData} />;
}
