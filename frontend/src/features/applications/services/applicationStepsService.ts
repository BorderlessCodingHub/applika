import {
  applicationStepsSchema,
  ApplicationStep,
  addStepPayloadSchema,
  AddStepPayload,
  UpdateStepPayload,
} from "../schemas/applicationsStepsSchema";
import { StepDefinition, supportSchema } from "../schemas/supportSchema";

export async function fetchApplicationSteps(
  applicationId: string | number
): Promise<ApplicationStep[]> {
  const res = await fetch(`/api/applications/${applicationId}/steps`, {
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to fetch application steps");
  }

  const data = await res.json();
  return applicationStepsSchema.parse(data);
}

export async function fetchSupportsSteps(): Promise<StepDefinition[]> {
  const res = await fetch("/api/supports", { credentials: "include" });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to fetch supports");
  }

  const data = await res.json();
  const parsed = supportSchema.parse(data);
  return parsed.steps.filter((s) => !s.strict);
}

export async function addApplicationStep(
  applicationId: number | string,
  payload: AddStepPayload
) {
  const validated = addStepPayloadSchema.parse(payload);

  const res = await fetch(`/api/applications/${applicationId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(validated),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to add step");
  }

  return res.json();
}

export async function updateApplicationStep(
  applicationId: number | string,
  stepId: number | string,
  payload: UpdateStepPayload
) {
  const res = await fetch(
    `/api/applications/${applicationId}/steps/${stepId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to update step");
  }

  return res.json();
}

export async function deleteApplicationStep(
  applicationId: number | string,
  stepId: number | string
) {
  const res = await fetch(
    `/api/applications/${applicationId}/steps/${stepId}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to delete step");
  }

  return true;
}
