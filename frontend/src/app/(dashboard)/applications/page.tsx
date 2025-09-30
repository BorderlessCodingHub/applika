"use client";

import SearchApplications from "@/features/applications/components/SearchApplications";
import ApplicationsGrid from "@/features/applications/components/ApplicationsGrid";

export default function ApplicationsPage() {
  const applications = [
    {
      id: "1",
      company: "Tech Corp",
      role: "Frontend Developer",
      application_date: "2025-09-26",
      platform_name: "LinkedIn",
      step_name: "Interview",
      step_color: "#3498db",
      feedback_name: "Positive",
      feedback_color: "#2ecc71",
      salary_range_min: 80,
      salary_range_max: 120,
    },
    // more applications...
  ];

  return (
    <main className="px-4 py-8">
      <h1 className="text-center text-2xl font-bold mb-6">Applications</h1>
      <section>
        <SearchApplications />
        <ApplicationsGrid applications={applications} />
      </section>
    </main>
  );
}
