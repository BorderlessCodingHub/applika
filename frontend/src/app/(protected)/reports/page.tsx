"use client";

import { useRouter } from "next/navigation";
import { BadgeGate } from "@/components/badges/badge-gate";
import {
  ReportsScreen,
  renderReportsClosed,
} from "@/components/phone/screens/reports-screen";
import { ReportsList } from "@/components/reports/report-list";
import { useIsPhone } from "@/hooks/use-is-phone";
import type { ReportDaysType } from "@/services/types/reports";

/**
 * `/reports`: below md the Reports board, its closed layout included (PRD
 * 0021); at md and up today's list. Both sit inside `BadgeGate`, above the
 * report hooks.
 */
export default function ReportPage() {
  const router = useRouter();
  const isPhone = useIsPhone();

  const handleSelect = (day: ReportDaysType) => {
    router.push(`/reports/${day}`);
  };

  return isPhone ? (
    <BadgeGate closed={renderReportsClosed}>
      <ReportsScreen />
    </BadgeGate>
  ) : (
    <BadgeGate>
      <ReportsList onFillReport={handleSelect} onViewReport={handleSelect} />
    </BadgeGate>
  );
}
