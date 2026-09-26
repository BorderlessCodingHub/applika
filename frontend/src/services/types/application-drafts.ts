import type { ModeType, WorkModeType } from "@/services/types/applications";
import type {
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "@/services/types/users";

/**
 * `/applications/drafts*` (PRD 0010, KODI-033; revised KODI-036). A draft is
 * an application not yet finished, but it DOES carry a date from the moment
 * step 1 exists: `application_date` presets to the browser's own calendar day
 * (`localCalendarDay()`), autosaves like every other field, survives a
 * resume, and is what `finish` dates the application with (AC1).
 *
 * `PUT /applications/drafts/{id}` is a FULL REPLACE, exactly like the
 * application's own update — autosave must always send the whole `DraftInput`,
 * never a partial. `company_id` wins over `company_name` server-side; when
 * `company_id` is set the server takes the name from that row.
 */
export interface DraftInput {
  company_id: string | null;
  company_name: string;
  role: string;
  platform_id: string;
  mode: ModeType;
  /** `YYYY-MM-DD`. Optional on the wire (server defaults to today when
   * absent on POST, keeps the stored value when absent on PUT) but the web
   * client always sends it — see the note above. */
  application_date?: string;
  link_to_job?: string | null;
  observation?: string;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  currency?: SalaryCurrencyType;
  salary_period?: SalaryPeriodType;
  experience_level?: SeniorityLevelType;
  work_mode?: WorkModeType;
  country?: string;
  job_description?: string | null;
}

export interface Draft extends DraftInput {
  id: string;
  has_cv: boolean;
  /** Always present on a response, whatever the request sent (server default
   * or stored value fills the gap). */
  application_date: string;
  created_at: string;
  updated_at: string;
}

/** `GET /applications/drafts` row — the Drafts section's list. */
export interface DraftSummary {
  id: string;
  company_name: string;
  role: string;
  platform_id: string;
  has_cv: boolean;
  created_at: string;
  updated_at: string;
}
