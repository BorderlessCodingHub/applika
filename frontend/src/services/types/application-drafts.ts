import type { ModeType, WorkModeType } from "@/services/types/applications";
import type {
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "@/services/types/users";

/**
 * `/applications/drafts*` (PRD 0010, KODI-033). A draft is an application not
 * yet finished: no date, and no source-of-truth CV copy requirement until
 * `finish`.
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
