// src/features/applications/components/index.tsx
"use client";

import { useMemo } from "react";
import ApplicationsGrid from "./ApplicationsGridClient";
import ApplicationCardSkeleton from "@/components/ui/ApplicationCardSekelton";
import type { Application } from "../../types";
import { useApplications } from "../../hooks/useApplications";
import { FilterStatus } from "@/domain/constants/application";

interface ApplicationsGridIndexProps {
  searchTerm: string;
  filterStatus: FilterStatus;
  addAppOpen?: boolean;
  setAddAppOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

const normalizeString = (str: string | undefined | null): string =>
  (str || "").trim().toLowerCase();

const filterStrategies: Record<
  FilterStatus,
  (apps: Application[]) => Application[]
> = {
  all: (apps) => apps,
  open: (apps) => apps.filter(({ finalized }) => !finalized),
  closed: (apps) => apps.filter(({ finalized }) => finalized),
};

const filterByStatus = (
  status: FilterStatus,
  applications: Application[],
): Application[] => {
  const strategy = filterStrategies[status] ?? filterStrategies.all;
  return strategy(applications);
};

const matchesSearchTerm = (app: Application, searchTerm: string): boolean => {
  if (!searchTerm) {
    return true;
  }

  const normalizedTerm = normalizeString(searchTerm);
  const company = normalizeString(app.company);
  const role = normalizeString(app.role);

  return company.includes(normalizedTerm) || role.includes(normalizedTerm);
};

export default function ApplicationsGridIndex({
  searchTerm,
  filterStatus,
}: ApplicationsGridIndexProps) {
  const { applications, isLoading, error } = useApplications();

  const normalizedSearchTerm = useMemo(
    () => normalizeString(searchTerm),
    [searchTerm],
  );

  const appsWithFinalized = useMemo(
    () =>
      applications.map((app) => ({
        ...app,
        finalized: app.finalized ?? app.feedback !== null,
      })),
    [applications],
  );

  const filteredApps = useMemo(() => {
    const appsByStatus = filterByStatus(
      filterStatus as FilterStatus,
      appsWithFinalized,
    );

    if (!normalizedSearchTerm) {
      return appsByStatus;
    }

    return appsByStatus.filter((app) =>
      matchesSearchTerm(app, normalizedSearchTerm),
    );
  }, [appsWithFinalized, normalizedSearchTerm, filterStatus]);

  if (isLoading)
    return (
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <ApplicationCardSkeleton key={i} />
        ))}
      </div>
    );

  return (
    <ApplicationsGrid applications={filteredApps} searchTerm={searchTerm} />
  );
}
