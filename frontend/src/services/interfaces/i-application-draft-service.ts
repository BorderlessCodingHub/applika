import type { Application } from "@/services/types/applications";
import type {
  Draft,
  DraftInput,
  DraftSummary,
} from "@/services/types/application-drafts";
import type { DraftFromJobInput } from "@/services/types/jobs";

export interface IApplicationDraftService {
  list(): Promise<DraftSummary[]>;
  get(id: string): Promise<Draft>;
  create(data: DraftInput): Promise<Draft>;
  /** `POST /applications/drafts/from-job` (PRD 0012, R-020/R-021): 409 when an
   * application for the job exists, 422 "This job has no title to start from". */
  createFromJob(data: DraftFromJobInput): Promise<Draft>;
  update(id: string, data: DraftInput): Promise<Draft>;
  remove(id: string): Promise<void>;
  /** `POST /applications/drafts/{id}/finish` — `applicationDate` is `YYYY-MM-DD`. */
  finish(id: string, applicationDate: string): Promise<Application>;
}
