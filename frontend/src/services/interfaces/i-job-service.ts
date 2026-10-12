import type { JobDetail, JobFilters, JobPage } from "@/services/types/jobs";

/** The job board (PRD 0012, KODI-047 `/jobs`), ported from Ían Muliterno's `i-job-service.ts`. */
export interface IJobService {
  /** `GET /jobs`: 25 per page; defaults are omitted and tags go as repeated `tags=` keys. */
  list(filters: JobFilters, page: number): Promise<JobPage>;
  /** `GET /jobs/{id}`: 404 for an unknown job, or one that left the list without an application of yours. */
  get(id: string): Promise<JobDetail>;
  /** `PUT /jobs/{id}/dismissal` (204). */
  dismiss(id: string): Promise<void>;
  /** `DELETE /jobs/{id}/dismissal` (204). */
  restore(id: string): Promise<void>;
}
