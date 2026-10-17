import {
  SALARY_CURRENCIES,
  SALARY_PERIODS,
} from "@/components/timeline/timeline-types";

export type DiscordAccountStatus = "active" | "needs_reconnect";

/**
 * The caller's own Discord connection (KODI-027, plan 0009). Never carries
 * the Discord id — the profile only ever renders `username`/`global_name`/
 * `avatar_url`/`status`. `null` means unlinked.
 */
export interface DiscordAccount {
  username: string;
  global_name: string | null;
  avatar_url: string | null;
  status: DiscordAccountStatus;
}

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
  /**
   * The caller's own Discord connection, or `null` when unlinked (KODI-027).
   * `discord_linked` is kept as `discord != null` for any caller that only
   * needs the flag.
   */
  discord: DiscordAccount | null;
  discord_linked: boolean;
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
