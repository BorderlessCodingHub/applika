"use client";

import { useState } from "react";
import SearchApplications from "../SearchApplications";
import ApplicationsGridIndex from "../ApplicationsGrid/index";
import FetchError from "@/components/ui/FetchError";
import { useApplications } from "../../hooks/useApplications";

export default function ApplicationsClientSection() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const { error } = useApplications();

  const handleSearchChange = (value: string) => setSearchTerm(value);
  const handleFilterChange = (value: string) => setFilterStatus(value);

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
      />
      <ApplicationsGridIndex
        searchTerm={searchTerm}
        filterStatus={filterStatus}
      />
    </section>
  );
}
