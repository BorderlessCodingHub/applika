export type ApplicationsStatistics = {
  total_applications: number;
  success_rate: number;
  offers: number;
  denials: number;
};

export type StepConversionRate = {
  id: number;
  name: string;
  color: string;
  total_applications: number;
  conversion_rate: number;
};

export type AverageDaysStep = {
  id: number;
  name: string;
  color: string;
  average_days: number;
};

export type PlatformApplications = {
  id: number;
  name: string;
  total_applications: number;
};

export type ModeApplications = {
  passive: number;
  active: number;
};

export type ApplicationsTrend = {
  application_date: string;
  total_applications: number;
};
