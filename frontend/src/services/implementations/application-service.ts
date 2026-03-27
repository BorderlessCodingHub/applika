import { api } from "@/lib/api-client";
import type { IApplicationService } from "@/services/interfaces/i-application-service";
import type {
  Application,
  ApplicationFinalizePayload,
  ApplicationStep,
  ApplicationStepPayload,
  CreateApplicationPayload,
} from "@/services/types/applications";

export class ApplicationService implements IApplicationService {
  getApplications(): Promise<Application[]> {
    return api.get<Application[]>("/applications").then((r) => r.data);
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

  getApplicationSteps(id: string): Promise<ApplicationStep[]> {
    return api
      .get<ApplicationStep[]>(`/applications/${id}/steps`)
      .then((r) => r.data);
  }

  addStep(
    applicationId: string,
    data: ApplicationStepPayload,
  ): Promise<ApplicationStep> {
    return api
      .post(`/applications/${applicationId}/steps`, data)
      .then((r) => r.data);
  }

  updateStep(
    applicationId: string,
    stepId: string,
    data: ApplicationStepPayload,
  ): Promise<ApplicationStep> {
    return api
      .put(`/applications/${applicationId}/steps/${stepId}`, data)
      .then((r) => r.data);
  }

  deleteStep(applicationId: string, stepId: string): Promise<void> {
    return api
      .delete(`/applications/${applicationId}/steps/${stepId}`)
      .then((r) => r.data);
  }

  finalizeApplication(
    id: string,
    data: ApplicationFinalizePayload,
  ): Promise<void> {
    return api.post(`/applications/${id}/finalize`, data).then((r) => r.data);
  }
}
