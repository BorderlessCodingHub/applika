import { api } from "@/lib/api-client";
import type { IApplicationDraftService } from "@/services/interfaces/i-application-draft-service";
import type { Application } from "@/services/types/applications";
import type {
  Draft,
  DraftInput,
  DraftSummary,
} from "@/services/types/application-drafts";

export class ApplicationDraftService implements IApplicationDraftService {
  list(): Promise<DraftSummary[]> {
    return api.get<DraftSummary[]>("/applications/drafts").then((r) => r.data);
  }

  get(id: string): Promise<Draft> {
    return api.get<Draft>(`/applications/drafts/${id}`).then((r) => r.data);
  }

  create(data: DraftInput): Promise<Draft> {
    return api.post<Draft>("/applications/drafts", data).then((r) => r.data);
  }

  update(id: string, data: DraftInput): Promise<Draft> {
    return api
      .put<Draft>(`/applications/drafts/${id}`, data)
      .then((r) => r.data);
  }

  remove(id: string): Promise<void> {
    return api.delete(`/applications/drafts/${id}`).then(() => undefined);
  }

  finish(id: string, applicationDate: string): Promise<Application> {
    return api
      .post<Application>(`/applications/drafts/${id}/finish`, {
        application_date: applicationDate,
      })
      .then((r) => r.data);
  }
}
