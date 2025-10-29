// src/features/applications/types.ts

export interface Step {
  id: string;
  step_id: string;
  step_name: string;
  step_date: string;
  observation?: string;
  step_color: string;
}

export interface CardDetailsProps {
  isOpen: boolean;
  id: string;
  expected_salary: number;
  salary_offer: number;
  mode: string;
  last_step_date: string;
  feedback_date: string;
  observation: string;
  steps: Step[];
}

export interface Application {
  id: string;
  company: string;
  role: string;
  application_date: string;

  // Platform
  platform_id?: number;
  platform_name?: string;

  // Salary
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  salary_offer?: number;

  // Extra info
  mode?: string;
  observation?: string;
  
  finalized?: boolean;

  feedback?: {
    id: number;
    name: string;
    color: string;
    date: string;
  } | null;

  // Steps
  step_name?: string;
  step_color?: string;
  feedback_name?: string;
  feedback_color?: string;
  steps?: Step[];
}
