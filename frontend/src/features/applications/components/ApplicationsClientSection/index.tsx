"use client";

import { useState } from "react";
import SearchApplications from "../SearchApplications";
import ApplicationsGridIndex from "../ApplicationsGrid/index";
import FetchError from "@/components/ui/FetchError";
import { useApplications } from "../../hooks/useApplications";

export default function ApplicationsClientSection() {
  const [searchTerm, setSearchTerm] = useState("");
  const { error } = useApplications();
  const [addAppOpen, setAddAppOpen] = useState(false);

  const handleSearchChange = (value: string) => setSearchTerm(value);

  if (error)
    return (
      <FetchError
        message="Failed to load applications"
        retry={() => window.location.reload()}
      />
    );

  return (
    <section className="space-y-6">
      <SearchApplications
        onSearchChange={handleSearchChange}
        onAddClick={() => setAddAppOpen(true)}
      />
      <ApplicationsGridIndex
        searchTerm={searchTerm}
        addAppOpen={addAppOpen}
        setAddAppOpen={setAddAppOpen}
      />
    </section>
  );
}
