import { api } from "@/lib/api-client";
import type { IReportsService } from "@/services/interfaces/i-reports-service";
import type {
  ReportDaysType,
  ReportDetailResponse,
  ReportsResponse,
  ReportSubmitPayload,
  ReportSubmitResponse,
} from "@/services/types/reports";

export class ReportsService implements IReportsService {
  fetchReports(): Promise<ReportsResponse> {
    return api.get<ReportsResponse>("/reports").then((res) => res.data);
  }

  fetchReportDetail(day: ReportDaysType): Promise<ReportDetailResponse> {
    return api
      .get<ReportDetailResponse>(`/reports/${day}`)
      .then((res) => res.data);
  }

  submitReport(
    day: ReportDaysType,
    payload: ReportSubmitPayload,
  ): Promise<ReportSubmitResponse> {
    return api
      .post<ReportSubmitResponse>(`/reports/${day}/submit`, payload)
      .then((res) => res.data);
  }
}
