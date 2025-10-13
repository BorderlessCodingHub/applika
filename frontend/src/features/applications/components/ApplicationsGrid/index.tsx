// src/features/applications/components/index.tsx
"use client";

import { useMemo } from "react";
import ApplicationsGrid from "./ApplicationsGridClient";
import type { Application } from "../../types";
import { useApplications } from "../../hooks/useApplicationModals";

interface ApplicationsGridIndexProps {
  searchTerm: string;
}

export default function ApplicationsGridIndex({
  searchTerm,
}: ApplicationsGridIndexProps) {
  const { applications, isLoading, error } = useApplications();

  const filteredApps = useMemo(() => {
    const term = (searchTerm || "").trim().toLowerCase();
    if (!term) return applications;

    return applications.filter((app: Application) => {
      const company = (app.company || "").toLowerCase();
      const role = (app.role || "").toLowerCase();
      return company.includes(term) || role.includes(term);
    });
  }, [applications, searchTerm]);

  if (isLoading)
    return <div className="p-6 text-white/70">Loading applications...</div>;
  if (error)
    return <div className="text-red-400">Failed to load applications</div>;

  return <ApplicationsGrid applications={filteredApps} />;
}
