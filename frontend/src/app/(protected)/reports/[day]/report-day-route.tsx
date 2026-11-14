"use client";

import { BadgeGate } from "@/components/badges/badge-gate";
import { ReportDayScreen } from "@/components/phone/screens/report-day-screen";
import { renderReportsClosed } from "@/components/phone/screens/reports-screen";
import { useIsPhone } from "@/hooks/use-is-phone";
import type { ReportDaysType } from "@/services/types/reports";
import { ReportDayClient } from "./report-day-page";

/**
 * `/reports/<day>`: below md the ReportDay board, its closed layout included
 * (PRD 0021); at md and up today's form or report. Both sit inside
 * `BadgeGate`, above the report hooks.
 */
export function ReportDayRoute({ day }: { day: ReportDaysType }) {
  const isPhone = useIsPhone();
  return isPhone ? (
    <BadgeGate closed={renderReportsClosed}>
      <ReportDayScreen day={day} />
    </BadgeGate>
  ) : (
    <BadgeGate>
      <ReportDayClient day={day} />
    </BadgeGate>
  );
}
