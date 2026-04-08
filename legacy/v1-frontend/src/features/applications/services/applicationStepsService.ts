import {
  applicationStepsSchema,
  ApplicationStep,
  addStepPayloadSchema,
  AddStepPayload,
  UpdateStepPayload,
} from "../schemas/applicationsStepsSchema";
import { StepDefinition, supportSchema } from "../schemas/supportSchema";
import { fetchSupports } from "./supportsService";
import { authFetcher } from "@/lib/auth/authFetcher";

export async function fetchApplicationSteps(
  applicationId: string | number
): Promise<ApplicationStep[]> {
  const data = await authFetcher(`/api/applications/${applicationId}/steps`);
  return applicationStepsSchema.parse(data);
}

export async function fetchSupportsSteps(): Promise<StepDefinition[]> {
  const parsed = await fetchSupports();
  return (parsed.steps ?? []).filter((s) => !s.strict);
}

export async function addApplicationStep(
  applicationId: number | string,
  payload: AddStepPayload
) {
  const validated = addStepPayloadSchema.parse(payload);
  return authFetcher(`/api/applications/${applicationId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });
}

export async function updateApplicationStep(
  applicationId: number | string,
  stepId: number | string,
  payload: UpdateStepPayload
) {
  return authFetcher(`/api/applications/${applicationId}/steps/${stepId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteApplicationStep(
  applicationId: number | string,
  stepId: number | string
) {
  await authFetcher(`/api/applications/${applicationId}/steps/${stepId}`, {
    method: "DELETE",
  });
  return true;
}
