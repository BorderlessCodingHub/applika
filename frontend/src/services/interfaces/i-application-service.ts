import type {
  Application,
  ApplicationFinalizePayload,
  ApplicationStep,
  ApplicationStepPayload,
  CreateApplicationPayload,
} from "@/services/types/applications";

export interface IApplicationService {
  getApplications(): Promise<Application[]>;
  createApplication(data: CreateApplicationPayload): Promise<Application>;
  updateApplication(
    id: string,
    data: CreateApplicationPayload,
  ): Promise<Application>;
  deleteApplication(id: string): Promise<void>;
  getApplicationSteps(id: string): Promise<ApplicationStep[]>;
  addStep(
    applicationId: string,
    data: ApplicationStepPayload,
  ): Promise<ApplicationStep>;
  updateStep(
    applicationId: string,
    stepId: string,
    data: ApplicationStepPayload,
  ): Promise<ApplicationStep>;
  deleteStep(applicationId: string, stepId: string): Promise<void>;
  finalizeApplication(
    id: string,
    data: ApplicationFinalizePayload,
  ): Promise<void>;
}
