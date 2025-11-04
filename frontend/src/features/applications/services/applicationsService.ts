import type { Application } from "../types";
import {
  supportSchema,
  FeedbackDefinition,
  StepDefinition,
  Platform,
} from "../schemas/supportSchema";
import { fetchSupports } from "./supportsService";
import { authFetcher, parseErrorResponse } from "@/lib/auth/authFetcher";

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

export const fetchApplications = (): Promise<Application[]> =>
  authFetcher("/api/applications");

export async function fetchSupportsPlatforms(): Promise<Platform[]> {
  const parsed = await fetchSupports();
  return parsed.platforms ?? [];
}

export async function fetchSupportsFeedbacks(): Promise<FeedbackDefinition[]> {
  const parsed = await fetchSupports();
  return parsed.feedbacks ?? [];
}

export async function fetchSupportsResults(): Promise<StepDefinition[]> {
  const parsed = await fetchSupports();
  // strict steps are results
  return (parsed.steps ?? []).filter((s) => s.strict);
}

export async function createApplication(payload: CreateApplicationPayload) {
  return authFetcher(`/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateApplication(
  applicationId: number | string,
  payload: UpdateApplicationPayload
) {
  return authFetcher(`/api/applications/${applicationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteApplication(applicationId: number | string) {
  await authFetcher(`/api/applications/${applicationId}`, {
    method: "DELETE",
  });
  return true;
}

export async function finalizeApplication(
  applicationId: number | string,
  payload: FinalizeApplicationPayload
) {
  return authFetcher(`/api/applications/${applicationId}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
