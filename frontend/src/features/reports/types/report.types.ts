export type ReportStatus = "submitted" | "pending" | "overdue" | "future";

export interface ReportDay {
  day: number;
  status: ReportStatus;
  submitted_at: string | null;
}

export interface Report {
  day: number;
  phase: number;
  submitted: boolean;
  submitted_at: string | null;
}

export interface ReportMetrics {
  // Current period metrics
  applications_count: number;
  initial_screenings_count: number;
  interviews_completed_fortnight: number;
  active_processes_count: number;
  offers_count: number;

  // Accumulated metrics
  total_applications_count: number;
  callback_rate: number;
  offer_rate: number;
  overall_conversion_rate: number;
  total_initial_screenings_count: number;
}

export interface ReportPeriod {
  start_date: string;
  end_date: string;
}

export interface ReportManualMetrics {
  mock_interviews_count: number;
  linkedin_posts_count: number;
  strategic_connections_count: number;
  biggest_win: string;
  biggest_challenge: string;
  next_fortnight_goal: string;
}

export interface ReportsResponse {
  reports: ReportDay[];
  current_day: number;
  current_phase: number;
  start_date: string;
}

export interface ReportDetailResponse {
  report: Report;
  metrics: ReportMetrics;
  can_submit: boolean;
  period: ReportPeriod;
  manual_metrics?: ReportManualMetrics;
}

export interface ReportSubmitPayload {
  start_date?: string;
  mock_interviews_count: number;
  linkedin_posts_count: number;
  strategic_connections_count: number;
  biggest_win: string;
  biggest_challenge: string;
  next_fortnight_goal: string;
}

export interface ReportSubmitResponse {
  success: boolean;
  report_id: number;
  discord_posted: boolean;
  discord_error?: string;
}
