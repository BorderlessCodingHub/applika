"use client";

import { useMemo, useState } from "react";
import SearchApplications from "../SearchApplications";
import ApplicationsGrid from "../ApplicationsGrid/ApplicationsGridClient";
import ApplicationCardSkeleton from "@/components/ui/ApplicationCardSekelton";
import FetchError from "@/components/ui/FetchError";
import { useApplications } from "../../hooks/useApplications";
import { FilterStatus } from "@/domain/constants/application";
import {
  filterByStatus,
  matchesSearchTerm,
  normalizeString,
} from "../../utils/filter";

export default function ApplicationsClientSection() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const { applications, error, isLoading } = useApplications();

  const handleSearchChange = (value: string) => setSearchTerm(value);
  const handleFilterChange = (value: FilterStatus) => setFilterStatus(value);

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
    const appsByStatus = filterByStatus(filterStatus, appsWithFinalized);

    if (!normalizedSearchTerm) {
      return appsByStatus;
    }

    return appsByStatus.filter((app) =>
      matchesSearchTerm(app, normalizedSearchTerm),
    );
  }, [appsWithFinalized, normalizedSearchTerm, filterStatus]);

  if (error)
    return (
      <FetchError
        message="Failed to load applications"
        retry={() => window.location.reload()}
      />
    );

  return (
    <section className="space-y-6">
      <h1 className="text-center text-2xl font-bold mb-6">Applications</h1>
      <SearchApplications
        onSearchChange={handleSearchChange}
        onFilterChange={handleFilterChange}
        filterStatus={filterStatus}
        count={filteredApps.length}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <ApplicationCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <ApplicationsGrid applications={filteredApps} searchTerm={searchTerm} />
      )}
    </section>
  );
}
