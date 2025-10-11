import type { Application } from "../types";

export interface CreateApplicationPayload {
  company: string;
  role: string;
  mode: "active" | "passive";
  platform_id: number;
  application_date: string;
  observation?: string;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
}

export interface UpdateApplicationPayload extends CreateApplicationPayload {}

export interface FinalizeApplicationPayload {
  step_id: number;
  feedback_id: number;
  finalize_date: string;
  salary_offer?: number;
  observation?: string;
}

async function parseErrorResponse(res: Response) {
  const cloned = res.clone();

  try {
    const data = await cloned.json();
    return data.detail || JSON.stringify(data);
  } catch {
    const text = await res.text();
    return text || "Unknown error occurred";
  }
}

export async function fetchApplications(): Promise<Application[]> {
  const res = await fetch("/api/applications", {
    credentials: "include", // ensures cookies are sent
  });

  if (!res.ok) {
    throw new Error("Failed to fetch applications");
  }

  return res.json();
}

export async function createApplication(payload: CreateApplicationPayload) {
  const res = await fetch(`/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to create application");
  }

  return res.json();
}

export async function updateApplication(
  applicationId: number | string,
  payload: UpdateApplicationPayload
) {
  const res = await fetch(`/api/applications/${applicationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await parseErrorResponse(res));
  }

  return res.json();
}

export async function deleteApplication(applicationId: number | string) {
  const res = await fetch(`/api/applications/${applicationId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to delete application");
  }

  return true;
}

export async function finalizeApplication(
  applicationId: number | string,
  payload: FinalizeApplicationPayload
) {
  const res = await fetch(`/api/applications/${applicationId}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to finalize application");
  }

  return res.json();
}
