"use client";

import { useState, useCallback } from "react";
import SearchApplications from "../SearchApplications";
import ApplicationsGridIndex from "../ApplicationsGrid/index";

export default function ApplicationsClientSection() {
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearchChange = useCallback((value: string) => {
    console.log("[ApplicationsClientSection] searchTerm:", value);
    setSearchTerm(value);
  }, []);

  return (
    <section>
      <SearchApplications onSearchChange={handleSearchChange} />
      <ApplicationsGridIndex searchTerm={searchTerm} />
    </section>
  );
}
