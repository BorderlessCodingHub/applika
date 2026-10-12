import { api } from "@/lib/api-client";
import { filtersToSearchParams } from "@/components/jobs/job-filters-url";
import type { IJobService } from "@/services/interfaces/i-job-service";
import {
  JOB_FILTER_LIMITS,
  type JobDetail,
  type JobFilters,
  type JobPage,
} from "@/services/types/jobs";

/**
 * `GET /jobs` query string. Built by hand, never through axios `params`:
 * axios serialises an array as `tags[]=a&tags[]=b`, a key the API ignores,
 * which would make the tag filter silently do nothing.
 */
export function jobListQuery(filters: JobFilters, page: number): string {
  const params = filtersToSearchParams(filters);
  params.delete("page");
  params.set("page", String(Math.max(1, Math.floor(page))));
  params.set("per_page", String(JOB_FILTER_LIMITS.perPage));
  return params.toString();
}

/** Ported from Ían Muliterno's `job-service.ts` onto the KODI-047 contract. */
export class JobService implements IJobService {
  list(filters: JobFilters, page: number): Promise<JobPage> {
    return api
      .get<JobPage>(`/jobs?${jobListQuery(filters, page)}`)
      .then((r) => r.data);
  }

  get(id: string): Promise<JobDetail> {
    return api
      .get<JobDetail>(`/jobs/${encodeURIComponent(id)}`)
      .then((r) => r.data);
  }

  dismiss(id: string): Promise<void> {
    return api
      .put(`/jobs/${encodeURIComponent(id)}/dismissal`)
      .then(() => undefined);
  }

  restore(id: string): Promise<void> {
    return api
      .delete(`/jobs/${encodeURIComponent(id)}/dismissal`)
      .then(() => undefined);
  }
}
