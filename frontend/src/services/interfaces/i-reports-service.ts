import type {
  ReportDaysType,
  ReportDetailResponse,
  ReportsResponse,
  ReportSubmitPayload,
  ReportSubmitResponse,
} from "@/services/types/reports";

export interface IReportsService {
  fetchReports(): Promise<ReportsResponse>;
  fetchReportDetail(day: ReportDaysType): Promise<ReportDetailResponse>;
  submitReport(
    day: ReportDaysType,
    payload: ReportSubmitPayload,
  ): Promise<ReportSubmitResponse>;
}
