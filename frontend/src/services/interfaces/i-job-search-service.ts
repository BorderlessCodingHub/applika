import type {
  JobSearch,
  JobSearchCreate,
  JobSearchUpdate,
} from "@/services/types/job-searches";

/** Saved job searches (PRD 0012 R-031/R-032, `/job-searches`). */
export interface IJobSearchService {
  /** Ordered by name. */
  list(): Promise<JobSearch[]>;
  /** 409 on a duplicate name or past the cap of 10. */
  create(data: JobSearchCreate): Promise<JobSearch>;
  update(id: string, data: JobSearchUpdate): Promise<JobSearch>;
  remove(id: string): Promise<void>;
}
