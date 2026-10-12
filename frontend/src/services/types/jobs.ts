/**
 * Job board wire shapes (PRD 0012, KODI-047 `backend/app/presentation/schemas/jobs.py`).
 * Ported from Ían Muliterno's `job_scrapping` branch (`e670914`,
 * `frontend/src/services/types/jobs.ts`) onto the KODI-047 contract. IDs are
 * Snowflake STRINGS on the wire.
 */

export type JobSort = "newest" | "fit";

/**
 * What the list shows: the query of `GET /jobs` and the `filters` body of a
 * saved search. The server sends it back FULL, defaults included, so every key
 * is present here; `null` and `[]` are "no filter".
 */
export interface JobFilters {
  search: string | null;
  source: string | null;
  /** A job matches when it carries EVERY tag. Case-sensitive. */
  tags: string[];
  /** A job with no fit is excluded once this is set, `0` included. */
  min_fit: number | null;
  posted_within_days: number | null;
  sort: JobSort;
  include_dismissed: boolean;
}

export const DEFAULT_JOB_FILTERS: JobFilters = {
  search: null,
  source: null,
  tags: [],
  min_fit: null,
  posted_within_days: null,
  sort: "newest",
  include_dismissed: false,
};

/** The server's ranges (`schemas/jobs.py`); keep every client ceiling at or under them. */
export const JOB_FILTER_LIMITS = {
  searchMax: 200,
  sourceMax: 50,
  tagsMax: 10,
  tagMax: 100,
  minFitMin: 0,
  minFitMax: 100,
  postedWithinMin: 1,
  postedWithinMax: 15,
  perPage: 25,
  perPageMax: 100,
} as const;

export interface JobSourceRef {
  code: string;
  name: string;
}

/** No user route lists sources; the PRD fixes these two (Plan corrections 18). */
export const JOB_SOURCES: readonly JobSourceRef[] = [
  { code: "himalayas", name: "Himalayas" },
  { code: "remoteok", name: "RemoteOK" },
];

export interface JobBestFit {
  base_cv_id: string;
  score: number;
}

/** The user's own application or draft started from the job. */
export interface JobApplicationRef {
  id: string;
  is_draft: boolean;
}

export interface JobSummary {
  id: string;
  source: JobSourceRef;
  title: string;
  company_name: string;
  location_text: string;
  employment_type: string | null;
  salary_text: string | null;
  tags: string[];
  posted_at: string | null;
  job_url: string;
  is_active: boolean;
  /** Stored score on the list; `GET /jobs/{id}` computes it live, so the two may differ. */
  best_fit: JobBestFit | null;
  dismissed: boolean;
  application: JobApplicationRef | null;
}

/** One master CV against one job. A CV absent from `fits` has no fit yet. */
export interface JobFit {
  base_cv_id: string;
  base_cv_name: string;
  score: number;
  matched_keywords: string[];
  missing_keywords: string[];
}

export interface JobDetail extends JobSummary {
  description_text: string;
  company_url: string | null;
  fits: JobFit[];
}

export interface JobPage {
  items: JobSummary[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/** `POST /applications/drafts/from-job` `tailoring`; `"copy"` is the default everywhere (R-026). */
export type JobTailoring = "copy" | "keywords";

export interface DraftFromJobInput {
  job_id: string;
  base_cv_id?: string;
  tailoring?: JobTailoring;
}
