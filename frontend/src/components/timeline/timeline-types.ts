/**
 * Presentational view-models for the application timeline (PRD 0008, ADR 0012).
 *
 * These are camelCase view shapes the design-system components render — NOT the
 * on-the-wire DTOs (which are snake_case, per `@/services/types/*`). The
 * frontend-engineer maps the API response into these once in the data layer.
 * Salary numerics stay as strings because they arrive as strings on the wire and
 * are only formatted for display (see `formatOfferSalary` in `./timeline-format`).
 */

/**
 * Hardcoded 3-value event type — NOT a DB catalog. Order here is the canonical
 * display/selector order. Note and feedback are gone: the API refuses them and
 * stored ones read as interviews of type unknown (ADR 0020).
 */
export const TIMELINE_EVENT_TYPES = ["interview", "offer", "denied"] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

/**
 * Hardcoded 7-value interview type, carried only by `interview` events. Order is
 * the API's (and the dashboard's stage order). `unknown` is the default.
 */
export const INTERVIEW_TYPES = [
  "unknown",
  "initial_screening",
  "technical",
  "cultural",
  "hiring_manager",
  "take_home",
  "final",
] as const;

export type InterviewType = (typeof INTERVIEW_TYPES)[number];

/**
 * Hardcoded 10-value reason, carried only by `denied` events (KODI-014). Order
 * is the API's and the CLI's. `unknown` is the default.
 */
export const DENIED_REASONS = [
  "unknown",
  "not_good_enough",
  "skills_mismatch",
  "assessment_failed",
  "too_many_candidates",
  "position_filled",
  "role_closed",
  "ghosted",
  "salary_mismatch",
  "other",
] as const;

export type DeniedReason = (typeof DENIED_REASONS)[number];

/**
 * Salary period as the API returns it. New offers are `monthly | annually`
 * only; `hourly` survives on offers migrated from steps or written by an old CLI.
 */
export const SALARY_PERIODS = ["hourly", "monthly", "annually"] as const;

export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

/**
 * Salary period for an Offer event the user writes. Restricted to `monthly |
 * annually` — the general application salary period also allows `hourly`, but
 * offers do not.
 */
export type OfferSalaryPeriod = "monthly" | "annually";

/** The 20 salary currencies, in the API's order (UPPERCASE ISO-4217). */
export const SALARY_CURRENCIES = [
  "USD",
  "BRL",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "INR",
  "CNY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "SGD",
  "HKD",
  "NZD",
  "MXN",
  "ZAR",
  "AED",
] as const;

export type SalaryCurrency = (typeof SALARY_CURRENCIES)[number];

/**
 * View-model for a single timeline event row/card. Scheduling and salary fields
 * are optional; salary fields are present only on `offer` events and
 * `interviewType` only on `interview` events.
 */
export interface TimelineEventView {
  /** Stable event id (string on the wire). */
  id: string;
  type: TimelineEventType;
  /** Interview-only: the interview type. `null`/absent reads as `unknown`. */
  interviewType?: InterviewType | null;
  /** Denied-only: the reason. `null`/absent reads as `unknown`. */
  deniedReason?: DeniedReason | null;
  /** ISO-8601 calendar date of the event (`YYYY-MM-DD`). Required. */
  eventDate: string;
  /** Optional scheduled start time (`HH:mm`, 24h). */
  startTime?: string | null;
  /** Optional scheduled end time (`HH:mm`, 24h). */
  endTime?: string | null;
  /** Optional IANA timezone (e.g. `Europe/London`) for the scheduled range. */
  timezone?: string | null;
  /** Free-text note / observation. Optional. */
  observation?: string | null;
  /** Offer-only: salary period. `hourly` only on legacy offers. */
  salaryPeriod?: SalaryPeriod | null;
  /** Offer-only: salary amount as a numeric string (wire format). */
  salaryAmount?: string | null;
  /** Offer-only: ISO-4217 currency code (uppercase, e.g. `GBP`). */
  salaryCurrency?: string | null;
}
