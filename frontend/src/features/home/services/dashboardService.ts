import {
  ApplicationsStatistics,
  StepConversionRate,
  AverageDaysStep,
  PlatformApplications,
  ModeApplications,
  ApplicationsTrend,
} from "../types";

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

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(await parseErrorResponse(res));
  return res.json();
}

export async function fetchApplicationsStatistics(): Promise<ApplicationsStatistics> {
  return fetcher<ApplicationsStatistics>("/api/stats");
}

export async function fetchApplicationsByPlatform(): Promise<PlatformApplications[]> {
  return fetcher<PlatformApplications[]>("/api/applications/statistics/platforms");
}

export async function fetchApplicationsByStep(): Promise<StepConversionRate[]> {
  return fetcher<StepConversionRate[]>("/api/applications/statistics/steps/conversion_rate");
}

export async function fetchAverageDaysBetweenSteps(): Promise<AverageDaysStep[]> {
  return fetcher<AverageDaysStep[]>("/api/applications/statistics/steps/avarage_days");
}

export async function fetchApplicationsByMode(): Promise<ModeApplications> {
  return fetcher<ModeApplications>("/api/applications/statistics/mode");
}

export async function fetchApplicationsTrend(): Promise<ApplicationsTrend[]> {
  return fetcher<ApplicationsTrend[]>("/api/applications/statistics/trends");
}
