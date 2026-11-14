"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  reportZodSchema,
  type ReportFormType,
} from "@/components/reports/report-form-config";
import type { ReportDetailResponse } from "@/services/types/reports";

/** A report's form values: the stored manual metrics, else zeros and blanks. */
export function buildReportFormDefault(
  reportData: ReportDetailResponse,
): ReportFormType {
  const manualMetrics = reportData.manual_metrics;
  return {
    start_date: reportData.period.start_date,
    mock_interviews_count: manualMetrics?.mock_interviews_count ?? 0,
    linkedin_posts_count: manualMetrics?.linkedin_posts_count ?? 0,
    strategic_connections_count:
      manualMetrics?.strategic_connections_count ?? 0,
    biggest_win: manualMetrics?.biggest_win ?? "",
    biggest_challenge: manualMetrics?.biggest_challenge ?? "",
    next_fortnight_goal: manualMetrics?.next_fortnight_goal ?? "",
  };
}

/**
 * The report form both report screens fill (the desktop `ReportForm` and the
 * phone ReportDay): the zod schema and the stored values.
 */
export function useReportForm(reportData: ReportDetailResponse) {
  return useForm<ReportFormType>({
    resolver: zodResolver(reportZodSchema),
    defaultValues: buildReportFormDefault(reportData),
  });
}
