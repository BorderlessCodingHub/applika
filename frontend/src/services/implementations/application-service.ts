import { api } from "@/lib/api-client";
import type { IApplicationService } from "@/services/interfaces/i-application-service";
import type {
  Application,
  CreateApplicationPayload,
  FinalizeApplicationPayload,
} from "@/services/types/applications";

export class ApplicationService implements IApplicationService {
  getApplications(cycleId?: string | null): Promise<Application[]> {
    const params = cycleId ? { cycle_id: cycleId } : {};
    return api
      .get<Application[]>("/applications", { params })
      .then((r) => r.data);
  }

  createApplication(data: CreateApplicationPayload): Promise<Application> {
    return api.post("/applications", data).then((r) => r.data);
  }

  updateApplication(
    id: string,
    data: CreateApplicationPayload,
  ): Promise<Application> {
    return api.put(`/applications/${id}`, data).then((r) => r.data);
  }

  deleteApplication(id: string): Promise<void> {
    return api.delete(`/applications/${id}`).then((r) => r.data);
  }

  finalize(
    id: string,
    payload?: FinalizeApplicationPayload,
  ): Promise<Application> {
    return api
      .post<Application>(`/applications/${id}/finalize`, payload)
      .then((r) => r.data);
  }

  reopen(id: string): Promise<Application> {
    return api
      .post<Application>(`/applications/${id}/reopen`)
      .then((r) => r.data);
  }
}
