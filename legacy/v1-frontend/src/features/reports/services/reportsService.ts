import { authFetcher } from "@/lib/auth/authFetcher";
import type {
  ReportDetailResponse,
  ReportsResponse,
  ReportSubmitPayload,
  ReportSubmitResponse,
} from "../types/report.types";

export const REPORT_DAYS = [1, 14, 28, 42, 56, 70, 84, 98, 112, 120];

export const fetchReports = (): Promise<ReportsResponse> =>
  authFetcher("/api/reports");

export const fetchReportDetail = (
  day: number
): Promise<ReportDetailResponse> => authFetcher(`/api/reports/${day}`);

export const submitReport = (
  day: number,
  payload: ReportSubmitPayload
): Promise<ReportSubmitResponse> =>
  authFetcher(`/api/reports/${day}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
