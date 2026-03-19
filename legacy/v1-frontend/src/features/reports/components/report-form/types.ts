import type {
  FieldErrors,
  UseFormHandleSubmit,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";
import type {
  ReportDetailResponse,
  ReportManualMetrics,
} from "../../types/report.types";

export interface ReportFormData {
  start_date?: string;
  mock_interviews_count: number;
  linkedin_posts_count: number;
  strategic_connections_count: number;
  biggest_win: string;
  biggest_challenge: string;
  next_fortnight_goal: string;
}

export type ReportMetrics = ReportDetailResponse["metrics"];

export type ReportFormErrors = FieldErrors<ReportFormData>;
export type ReportFormRegister = UseFormRegister<ReportFormData>;
export type ReportFormSetValue = UseFormSetValue<ReportFormData>;
export type ReportFormHandleSubmit = UseFormHandleSubmit<ReportFormData>;

export interface EditSectionBaseProps {
  values: ReportFormData;
  errors: ReportFormErrors;
  setValue: ReportFormSetValue;
}

export interface ReadonlySectionBaseProps {
  manualMetrics?: ReportManualMetrics;
}
