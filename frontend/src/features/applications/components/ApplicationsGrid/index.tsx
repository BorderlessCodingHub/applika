// src/features/applications/components/index.tsx
"use client";

import { useMemo } from "react";
import ApplicationsGrid from "./ApplicationsGridClient";
import ApplicationCardSkeleton from "@/components/ui/ApplicationCardSekelton";
import type { Application } from "../../types";
import { useApplications } from "../../hooks/useApplications";

interface ApplicationsGridIndexProps {
  searchTerm: string;
  addAppOpen?: boolean; // optional if you want
  setAddAppOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ApplicationsGridIndex({
  searchTerm,
  // addAppOpen,
  // setAddAppOpen,
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
      // addAppOpen={addAppOpen} // forward it here
      // setAddAppOpen={setAddAppOpen} // forward it here
      searchTerm={searchTerm}
    />
  );
}
