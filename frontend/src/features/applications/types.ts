export interface Step {
  id: number;
  step_id: number;
  step_name: string;
  step_date: string;
  observation?: string;
  step_color?: string;
}

export interface LastStep {
  id: number;
  name: string;
  color: string;
  date: string;
}

export type Mode = "active" | "passive";

export interface Application {
  id: number;
  company: string;
  role: string;
  application_date: string;

  // Platform
  platform?: { id: number; name: string };
  platform_id: number;
  platform_name?: string;

  // Salary
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  salary_offer?: number;

  // Extra info
  mode: Mode;
  observation?: string;

  finalized?: boolean;

  feedback?: {
    id: number;
    name: string;
    color: string;
    date: string;
  } | null;

  last_step?: LastStep | null;

  // Steps
  step_name?: string;
  step_color?: string;
  feedback_name?: string;
  feedback_color?: string;
  steps?: Step[];
}

export type Option = {
  id: string | number;
  name: string;
};