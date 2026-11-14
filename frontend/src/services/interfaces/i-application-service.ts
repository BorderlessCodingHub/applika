import type {
  Application,
  CreateApplicationPayload,
  FinalizeApplicationPayload,
} from "@/services/types/applications";

export interface IApplicationService {
  getApplications(cycleId?: string | null): Promise<Application[]>;
  createApplication(data: CreateApplicationPayload): Promise<Application>;
  updateApplication(
    id: string,
    data: CreateApplicationPayload,
  ): Promise<Application>;
  deleteApplication(id: string): Promise<void>;
  /**
   * Closes the application (`POST /applications/{id}/finalize`, 200,
   * idempotent). No payload closes with no outcome event; a payload records an
   * `offer`/`denied` outcome as the closing timeline event. 409 if already
   * closed... reopen first; 422 if archived; 404 if not owned.
   */
  finalize(
    id: string,
    payload?: FinalizeApplicationPayload,
  ): Promise<Application>;
  /**
   * Reopens a closed application (`POST /applications/{id}/reopen`, 200,
   * idempotent). 422 if archived; 404 if not owned.
   */
  reopen(id: string): Promise<Application>;
}
