// Server component — no "use client"
import ApplicationsClientSection from "@/features/applications/components/ApplicationsClientSection";

export default function ApplicationsPage() {
  return (
    <main className="px-4 py-8">
      <h1 className="text-center text-2xl font-bold mb-6">Applications</h1>

      <ApplicationsClientSection />
    </main>
  );
}
