"use client";

import SearchApplications from "@/features/applications/components/SearchApplications";
import ApplicationsGrid from "@/features/applications/components/ApplicationsGrid/index";

export default function ApplicationsPage() {
  
  return (
    <main className="px-4 py-8">
      <h1 className="text-center text-2xl font-bold mb-6">Applications</h1>
      <section>
        <SearchApplications />
        <ApplicationsGrid />
      </section>
    </main>
  );
}
