"use client";

import { useState, useCallback } from "react";
import SearchApplications from "../SearchApplications";
import ApplicationsGridIndex from "../ApplicationsGrid/index";
import FetchError from "@/components/ui/FetchError";
import { useApplications } from "../../hooks/useApplications";

export default function ApplicationsClientSection() {
  const [searchTerm, setSearchTerm] = useState("");
  const { error } = useApplications();

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  if (error)
    return (
      <FetchError
        message="Failed to load applications"
        retry={() => window.location.reload()}
      />
    );

  return (
    <section className="space-y-6">
      <SearchApplications onSearchChange={handleSearchChange} />
      <ApplicationsGridIndex searchTerm={searchTerm} />
    </section>
  );
}
