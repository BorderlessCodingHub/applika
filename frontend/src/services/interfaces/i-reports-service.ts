import type {
  ReportDaysType,
  ReportDetailResponse,
  ReportsResponse,
  ReportSubmitPayload,
  ReportSubmitResponse,
} from "@/services/types/reports";

export interface IReportsService {
  fetchReports(cycleId?: string | null): Promise<ReportsResponse>;
  fetchReportDetail(
    day: ReportDaysType,
    startDate?: string,
    cycleId?: string | null,
  ): Promise<ReportDetailResponse>;
  submitReport(
    day: ReportDaysType,
    payload: ReportSubmitPayload,
  ): Promise<ReportSubmitResponse>;
}
