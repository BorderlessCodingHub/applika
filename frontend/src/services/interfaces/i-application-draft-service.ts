import type { Application } from "@/services/types/applications";
import type {
  Draft,
  DraftInput,
  DraftSummary,
} from "@/services/types/application-drafts";

export interface IApplicationDraftService {
  list(): Promise<DraftSummary[]>;
  get(id: string): Promise<Draft>;
  create(data: DraftInput): Promise<Draft>;
  update(id: string, data: DraftInput): Promise<Draft>;
  remove(id: string): Promise<void>;
  /** `POST /applications/drafts/{id}/finish` — `applicationDate` is `YYYY-MM-DD`. */
  finish(id: string, applicationDate: string): Promise<Application>;
}
