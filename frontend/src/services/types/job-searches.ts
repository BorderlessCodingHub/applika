import type { JobFilters } from "@/services/types/jobs";

/**
 * Saved job searches (PRD 0012 R-031/R-032, KODI-047
 * `backend/app/presentation/schemas/job_searches.py`). No notification field
 * exists, by design (R-032).
 */

/** Server cap; a create past it is a 409 'Saved search limit reached (max 10)'. */
export const JOB_SEARCHES_MAX = 10;
/** `name` is stripped server-side and must be 1..100 characters. */
export const JOB_SEARCH_NAME_MAX = 100;

export interface JobSearch {
  id: string;
  name: string;
  /** Always the FULL `JobFilters`, defaults included. */
  filters: JobFilters;
  created_at: string;
  updated_at: string | null;
}

/** `filters` takes only `JobFilters` keys: an unknown key (e.g. `page`) is a 422. */
export interface JobSearchCreate {
  name: string;
  filters: JobFilters;
}

/** At least one of the two; neither is a 422. */
export interface JobSearchUpdate {
  name?: string;
  filters?: JobFilters;
}
