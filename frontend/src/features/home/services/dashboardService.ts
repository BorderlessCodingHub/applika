import {
  ApplicationsStatistics,
  StepConversionRate,
  AverageDaysStep,
  PlatformApplications,
  ModeApplications,
  ApplicationsTrend,
} from "../types";
import { authFetcher } from "@/lib/auth/authFetcher";

/**
 * All dashboard fetch calls now use authFetcher
 * for automatic 401 detection and redirect handling.
 */
export const fetchApplicationsStatistics = () =>
  authFetcher<ApplicationsStatistics>("/api/applications/statistics");

export const fetchApplicationsByPlatform = () =>
  authFetcher<PlatformApplications[]>("/api/applications/statistics/platforms");

export const fetchApplicationsByStep = () =>
  authFetcher<StepConversionRate[]>(
    "/api/applications/statistics/steps/conversion_rate"
  );

export const fetchAverageDaysBetweenSteps = () =>
  authFetcher<AverageDaysStep[]>(
    "/api/applications/statistics/steps/avarage_days"
  );

export const fetchApplicationsByMode = () =>
  authFetcher<ModeApplications>("/api/applications/statistics/mode");

export const fetchApplicationsTrend = () =>
  authFetcher<ApplicationsTrend[]>("/api/applications/statistics/trends");
