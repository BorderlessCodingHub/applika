"use client";

import { useEffect, useState, useMemo } from "react";
import ApplicationsGrid from "./ApplicationsGridClient";
import { fetchApplications } from "../../services/applicationsService";
import type { Application } from "../../types";

interface ApplicationsGridIndexProps {
  searchTerm: string;
}

export default function ApplicationsGridIndex({ searchTerm }: ApplicationsGridIndexProps) {
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

  const filteredApps = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return applications;

    return applications.filter((app) => {
      const company = app.company?.toLowerCase() ?? "";
      const role = app.role?.toLowerCase() ?? "";
      return company.includes(term) || role.includes(term);
    });
  }, [applications, searchTerm]);

  if (loading) return <div className="p-6 text-white/70">Loading applications...</div>;

  return <ApplicationsGrid applications={filteredApps} />;
}
