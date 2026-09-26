import {
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "./users";
import type {
  DeniedReason,
  InterviewType,
  OfferSalaryPeriod,
  SalaryCurrency,
  TimelineEventType,
} from "@/components/timeline/timeline-types";

export interface Company {
  id: string;
  name: string;
  url: string;
  /** `false` for a row only its creator sees (PRD 0010); absent on a typed-in name. */
  is_public?: boolean;
}

/**
 * One item of `GET /users/me/agenda` (PRD 0008, ADR 0012). `step_id`,
 * `step_name` and `step_color` are the legacy, now-nullable reverse-mapped
 * fields — the web must label the item from `event_type`/`interview_type`
 * (`stageLabel` in `@/components/timeline/timeline-options`), never from these.
 */
export interface AgendaStep {
  id: string;
  step_id?: string | null;
  step_date: string;
  step_name?: string | null;
  step_color?: string | null;
  event_type: TimelineEventType;
  interview_type?: InterviewType | null;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  observation?: string;
  application_id: string;
  company_name: string;
  role: string;
}

/**
 * Body for `POST /applications/{id}/finalize`. `outcome: undefined`/omitted
 * sends a bodyless request (idempotent close, no outcome event). `offer`
 * requires the salary triad; `denied` takes only the date/observation and an
 * optional `denied_reason` (KODI-014, default `unknown`) — `denied_reason` is
 * 422 with any other outcome, so it is never sent for `offer`.
 */
export interface FinalizeApplicationPayload {
  outcome: "offer" | "denied";
  /** `YYYY-MM-DD`; defaults server-side to today (UTC) when omitted. */
  event_date?: string;
  observation?: string;
  salary_amount?: string;
  salary_currency?: SalaryCurrency;
  salary_period?: OfferSalaryPeriod;
  /** Denied-only (KODI-014); omitted for `offer`. */
  denied_reason?: DeniedReason;
}

export interface Application {
  id: string;
  company_id: string | null;
  company_name: string;
  platform_id: string;
  role: string;
  mode: ModeType;
  application_date: string;
  link_to_job?: string;
  currency?: SalaryCurrencyType;
  salary_period?: SalaryPeriodType;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  experience_level?: SeniorityLevelType;
  work_mode?: WorkModeType;
  country?: string;
  observation?: string;
  /** The job posting's text, kept beside the application's CV copy (KODI-003). */
  job_description?: string | null;
  finalized: boolean;
  /**
   * ISO-8601 timestamp the application was closed, or `null` while open. The
   * single source of truth for "closed" — read-only timeline, no add/edit
   * event, no edit application, Reopen offered (PRD 0008, ADR 0012).
   */
  finalized_at: string | null;
}

export interface CreateApplicationPayload {
  company: string | { name: string; url: string | null };
  platform_id: string;
  role: string;
  mode: ModeType;
  application_date: string;
  link_to_job?: string;
  currency?: SalaryCurrencyType;
  salary_period?: SalaryPeriodType;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  experience_level?: SeniorityLevelType;
  work_mode?: WorkModeType;
  country?: string;
  observation?: string;
  job_description?: string | null;
}

export const WorkModeValues = ["remote", "hybrid", "on_site"] as const;
export type WorkModeType = (typeof WorkModeValues)[number];

export const ModeValues = ["active", "passive"] as const;
export type ModeType = (typeof ModeValues)[number];
