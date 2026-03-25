"use client";

import { useRouter } from "next/navigation";
import { ReportsList } from "@/components/reports/report-list";
import type { ReportDaysType } from "@/services/types/reports";

export default function ReportPage() {
  const router = useRouter();

  const handleSelect = (day: ReportDaysType) => {
    router.push(`/reports/${day}`);
  };

  return (
    <ReportsList onFillReport={handleSelect} onViewReport={handleSelect} />
  );
}
