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
  fetchReports(cycleId?: string | null): Promise<ReportsResponse> {
    const params = cycleId ? { cycle_id: cycleId } : {};
    return api
      .get<ReportsResponse>("/reports", { params })
      .then((res) => res.data);
  }

  fetchReportDetail(
    day: ReportDaysType,
    startDate?: string,
    cycleId?: string | null,
  ): Promise<ReportDetailResponse> {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (cycleId) params.cycle_id = cycleId;
    return api
      .get<ReportDetailResponse>(`/reports/${day}`, { params })
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
