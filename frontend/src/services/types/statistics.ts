export interface GeneralStats {
  total_applications: number;
  success_rate: number;
  offers: number;
  denials: number;
}

export interface ApiTrendPoint {
  application_date: string;
  total_applications: number;
}

export interface TrendPoint {
  application_date: string;
  label: string;
  total_applications: number;
}

export interface StepConversion {
  id: string;
  name: string;
  color: string;
  conversion_rate: number;
  total_applications: number;
}

export interface StepAvgDays {
  id: string;
  name: string;
  color: string;
  average_days: number;
}

export interface PlatformStat {
  id: string;
  name: string;
  total_applications: number;
}

export interface ModeStat {
  passive: number;
  active: number;
}
