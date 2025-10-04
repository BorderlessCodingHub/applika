export interface ApplicationStep {
  id: number;
  step_id: number;
  step_date: string;
  step_name?: string;
  observation?: string;
  step_color?: string; // optional for UI
}

export interface AddStepPayload {
  step_id: string;
  step_date: string;
  observation: string;
}

export async function fetchApplicationSteps(applicationId: string | number): Promise<ApplicationStep[]> {
  const res = await fetch(`/api/applications/${applicationId}/steps`, {
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to fetch application steps");
  }

  return res.json();
}

export async function addApplicationStep(
  applicationId: number | string,
  payload: AddStepPayload
) {
  const res = await fetch(`/api/applications/${applicationId}/steps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to add step");
  }

  return res.json();
}
