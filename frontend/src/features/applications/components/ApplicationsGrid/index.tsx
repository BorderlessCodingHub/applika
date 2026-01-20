// src/features/applications/components/index.tsx
"use client";

import { useMemo } from "react";
import ApplicationsGrid from "./ApplicationsGridClient";
import ApplicationCardSkeleton from "@/components/ui/ApplicationCardSekelton";
import type { Application } from "../../types";
import { useApplications } from "../../hooks/useApplications";

interface ApplicationsGridIndexProps {
  searchTerm: string;
  filterStatus: string;
  addAppOpen?: boolean;
  setAddAppOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

const filterStrategies: Record<
  string,
  (apps: Application[]) => Application[]
> = {
  all: (apps) => apps,
  open: (apps) => apps.filter(({ finalized }) => !finalized),
  closed: (apps) => apps.filter(({ finalized }) => !!finalized),
};

const getFilteredApplications = (
  status: string,
  applications: Application[]
) => {
  const strategy = filterStrategies[status] || filterStrategies.all;
  return strategy(applications);
};

export default function ApplicationsGridIndex({
  searchTerm,
  filterStatus,
}: ApplicationsGridIndexProps) {
  const { applications, isLoading, error } = useApplications();

  const filteredApps = useMemo(() => {
    const term = (searchTerm || "").trim().toLowerCase();

    const appsByStatus = getFilteredApplications(filterStatus, applications);

    if (!term) return appsByStatus;

    return appsByStatus.filter((app: Application) => {
      const company = (app.company || "").toLowerCase();
      const role = (app.role || "").toLowerCase();
      return company.includes(term) || role.includes(term);
    });
  }, [applications, searchTerm, filterStatus]);

  if (isLoading)
    return (
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <ApplicationCardSkeleton key={i} />
        ))}
      </div>
    );

  return (
    <ApplicationsGrid
      applications={filteredApps}
      searchTerm={searchTerm}
    />
  );
}
