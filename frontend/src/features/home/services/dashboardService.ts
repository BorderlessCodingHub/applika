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

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    next: { revalidate: 60, tags: [url] },
  });
  if (!res.ok) throw new Error(await parseErrorResponse(res));
  return res.json();
}

export const fetchApplicationsStatistics = () =>
  fetcher<ApplicationsStatistics>("/api/stats");

export const fetchApplicationsByPlatform = () =>
  fetcher<PlatformApplications[]>("/api/applications/statistics/platforms");

export const fetchApplicationsByStep = () =>
  fetcher<StepConversionRate[]>(
    "/api/applications/statistics/steps/conversion_rate"
  );

export const fetchAverageDaysBetweenSteps = () =>
  fetcher<AverageDaysStep[]>("/api/applications/statistics/steps/avarage_days");

export const fetchApplicationsByMode = () =>
  fetcher<ModeApplications>("/api/applications/statistics/mode");

export const fetchApplicationsTrend = () =>
  fetcher<ApplicationsTrend[]>("/api/applications/statistics/trends");
