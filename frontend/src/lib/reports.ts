import type {
  ReportDay,
  ReportDaysType,
  ReportStatus,
} from "@/services/types/reports";

/** The challenge's phase of each report day, as the reports list shows it. */
export const REPORT_PHASE: Record<ReportDaysType, 1 | 2 | 3 | 4> = {
  1: 1,
  14: 1,
  28: 1,
  42: 2,
  56: 2,
  70: 3,
  84: 3,
  98: 4,
  112: 4,
  120: 4,
};

/**
 * The status the list shows: an overdue report still within 14 days of its
 * day reads as pending.
 */
export function effectiveReportStatus(
  report: Pick<ReportDay, "day" | "status">,
  currentDay: number,
): ReportStatus {
  if (report.status === "overdue" && currentDay <= report.day + 14) {
    return "pending";
  }
  return report.status;
}
