"use client";

import { useEffect, useState } from "react";
import ApplicationsGrid from "./ApplicationsGridClient";
import { fetchApplications } from "../../services/applicationsService";
import type { Application } from "../../steps/types";

export default function ApplicationsGridIndex() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadApplications() {
      try {
        const data = await fetchApplications();
        setApplications(data);
      } catch (err) {
        console.error("Error fetching applications:", err);
      } finally {
        setLoading(false);
      }
    }

    loadApplications();
  }, []);

  if (loading) {
    return <div className="p-6 text-white/70">Loading applications...</div>;
  }

  return <ApplicationsGrid applications={applications} />;
}
