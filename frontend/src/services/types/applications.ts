import {
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "./users";

export interface Company {
  id: string;
  name: string;
  url: string
}

export interface ApplicationStep {
  id: string;
  step_id: string;
  step_date: string;
  observation?: string;
}

export interface Application {
  id: string;
  company_id: string | null;
  company_name: string;
  platform_id: string;
  role: string;
  mode: ModeType;
  application_date: string;
  link_to_job?: string;
  currency?: SalaryCurrencyType;
  salary_period?: SalaryPeriodType;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  experience_level?: SeniorityLevelType;
  work_mode?: WorkModeType;
  country?: string;
  observation?: string;
  finalized: boolean;
  last_step?: { name: string; color: string };
  feedback?: { name: string; color: string };
  steps?: ApplicationStep[];
}

export interface CreateApplicationPayload {
  company: string | { name: string; url: string | null };
  platform_id: string;
  role: string;
  mode: ModeType;
  application_date: string;
  link_to_job?: string;
  currency?: SalaryCurrencyType;
  salary_period?: SalaryPeriodType;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  experience_level?: SeniorityLevelType;
  work_mode?: WorkModeType;
  country?: string;
  observation?: string;
}

export const WorkModeValues = ["remote", "hybrid", "on_site"] as const;
export type WorkModeType = (typeof WorkModeValues)[number];

export const ModeValues = ["active", "passive"] as const;
export type ModeType = (typeof ModeValues)[number];
