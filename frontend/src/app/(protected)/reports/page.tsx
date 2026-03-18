import type { Metadata } from "next";
import { ReportsList } from "@/features/reports/components/ReportsList";

export const metadata: Metadata = {
  title: "My Reports | Applika",
  description: "Track your 120-day challenge progress with periodic reports",
};

export default function ReportsPage() {
  return <ReportsList />;
}
