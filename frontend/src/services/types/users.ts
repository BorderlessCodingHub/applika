export interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  github_id: string;
  current_role?: string;
  current_company?: string;
  current_salary?: number;
  salary_currency?: SalaryCurrencyType;
  salary_period?: SalaryPeriodType;
  experience_years?: number;
  seniority_level?: SeniorityLevelType;
  location?: string;
  availability?: AvailabilityType;
  bio?: string;
  linkedin_url?: string;
  tech_stack?: string[];
  is_admin?: boolean;
}

export type UpdateUserPayload = Partial<
  Pick<
    User,
    | "first_name"
    | "last_name"
    | "current_role"
    | "current_company"
    | "current_salary"
    | "salary_currency"
    | "salary_period"
    | "experience_years"
    | "seniority_level"
    | "location"
    | "availability"
    | "bio"
    | "linkedin_url"
    | "tech_stack"
  >
>;

export const SeniorityLevelValues = [
  "intern",
  "junior",
  "mid_level",
  "senior",
  "staff",
  "lead",
  "principal",
  "specialist",
] as const;
export type SeniorityLevelType = (typeof SeniorityLevelValues)[number];

export const AvailabilityValues = [
  "open_to_work",
  "casually_looking",
  "not_looking",
] as const;
export type AvailabilityType = (typeof AvailabilityValues)[number];

export const SalaryPeriodValues = ["hourly", "monthly", "annual"] as const;
export type SalaryPeriodType = (typeof SalaryPeriodValues)[number];

export const SalaryCurrencyValues = [
  "USD",
  "BRL",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "INR",
] as const;
export type SalaryCurrencyType = (typeof SalaryCurrencyValues)[number];
