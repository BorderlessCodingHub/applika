import {
  SALARY_CURRENCIES,
  SALARY_PERIODS,
} from "@/components/timeline/timeline-types";

export type MembershipBadgeKey = "borderless_base" | "borderless_psp";

/** A recorded (live) badge, held or not: it counts only while `borderless.status` is `active`. */
export interface UserBadge {
  badge: MembershipBadgeKey;
  granted_at: string;
}

export type BorderlessAccessStatus = "active" | "expired" | "needs_reconnect";

/** The Borderless access from the last password sign-in, computed by the server per request. */
export interface BorderlessAccess {
  status: BorderlessAccessStatus;
  expires_at: string;
  email: string;
}

/** `available`: no GitHub identity on record. `prompt`: the one-time `/welcome` choice is still open. */
export interface GithubRestoreState {
  available: boolean;
  prompt: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  /** The GitHub-era identity on record, a JSON number; `null` for a Borderless-only account. */
  github_id: number | null;
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
  /** Live badge rows, held or not. */
  badges: UserBadge[];
  borderless: BorderlessAccess | null;
  github_restore: GithubRestoreState;
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

/**
 * AC9 (R-031): the single source of truth for the salary periods and the 20
 * currencies (applika's original 9 + 11 added) is
 * `@/components/timeline/timeline-types` — re-exported here (not redefined)
 * so profile and application forms show the same list the timeline and
 * finalize dialogs do, and so `"annual"` cannot resurface on the web (the
 * API now returns `"annually"`; only the CLI keeps sending `"annual"`, which
 * is a backend/CLI compatibility concern, not a web one).
 */
export const SalaryPeriodValues = SALARY_PERIODS;
export type SalaryPeriodType = (typeof SalaryPeriodValues)[number];

export const SalaryCurrencyValues = SALARY_CURRENCIES;
export type SalaryCurrencyType = (typeof SalaryCurrencyValues)[number];
