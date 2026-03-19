import type {
  Application,
  ApplicationStep,
  CreateApplicationPayload,
} from "@/services/types/applications";

export interface IApplicationService {
  getApplications(): Promise<Application[]>;
  createApplication(data: CreateApplicationPayload): Promise<Application>;
  updateApplication(
    id: string,
    data: CreateApplicationPayload
  ): Promise<Application>;
  deleteApplication(id: string): Promise<void>;
  getApplicationSteps(id: string): Promise<ApplicationStep[]>;
  addStep(
    applicationId: string,
    data: { step_id: string; step_date: string; observation?: string }
  ): Promise<ApplicationStep>;
  updateStep(
    applicationId: string,
    stepId: string,
    data: { step_id: string; step_date: string; observation?: string }
  ): Promise<ApplicationStep>;
  deleteStep(applicationId: string, stepId: string): Promise<void>;
  finalizeApplication(
    id: string,
    data: {
      step_id: string;
      feedback_id: string;
      finalize_date: string;
      salary_offer?: number;
      observation?: string;
    }
  ): Promise<void>;
}
