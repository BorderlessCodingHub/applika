/**
 * Application timeline wire DTOs (PRD 0008, ADR 0012).
 *
 * Hand-written snake_case types mirroring the backend contract by hand (no
 * OpenAPI codegen in this project). Ids are strings and the offer salary amount
 * is a decimal string on the wire. `event_type` is the hardcoded 5-value enum
 * (NOT a DB catalog) and `interview_type` the hardcoded 7-value enum, carried
 * only by `interview` events — both canonical unions live once in
 * `@/components/timeline/timeline-types` and are reused here so there is a
 * single definition. Salary fields are present only on `offer` events (DB
 * CHECK); the create/update payloads model that with a discriminated union so
 * the three fields are omitted for every other type and required for offers.
 *
 * `interview_type` is an optional field of `NonOfferTimelineEventPayload`,
 * present only when `event_type` is `"interview"`.
 */

import type {
  DeniedReason,
  InterviewType,
  OfferSalaryPeriod,
  SalaryCurrency,
  SalaryPeriod,
  TimelineEventType,
} from "@/components/timeline/timeline-types";

/**
 * A timeline event as returned by `GET /applications/{id}/timeline`,
 * `POST …/timeline`, and `PUT …/timeline/{event_id}`. The scheduling trio
 * (`start_time`/`end_time`/`timezone`) is OPTIONAL — the keys themselves are
 * ABSENT (not merely `null`) whenever `event_type !== "interview"` (KODI-016:
 * the API omits them for non-interview events). `interview_type` is non-null
 * only for `interview` events and the salary trio only for `offer` events.
 * `salary_period` can be the legacy `hourly` on an offer migrated from a step or
 * written by an old CLI.
 */
export interface TimelineEvent {
  /** Stable event id (string). */
  id: string;
  /** Owning application id (string). */
  application_id: string;
  /** Owning user id (string). */
  user_id: string;
  /** Hardcoded 5-value type (`note | interview | feedback | offer | denied`). */
  event_type: TimelineEventType;
  /** Interview-only: one of the 7 hardcoded interview types. */
  interview_type: InterviewType | null;
  /** Denied-only: one of the 10 hardcoded reasons (KODI-014). */
  denied_reason: DeniedReason | null;
  /** ISO-8601 calendar date (`YYYY-MM-DD`). Required. */
  event_date: string;
  /** Scheduled start time (`HH:mm`, 24h). ABSENT on a non-interview event. */
  start_time?: string | null;
  /** Scheduled end time (`HH:mm`, 24h). ABSENT on a non-interview event. */
  end_time?: string | null;
  /** IANA timezone for the scheduled range. ABSENT on a non-interview event. */
  timezone?: string | null;
  /** Free-text note / observation. */
  observation: string | null;
  /** Offer-only: salary period (`hourly` only on legacy offers). */
  salary_period: SalaryPeriod | null;
  /** Offer-only: salary amount as a decimal string (wire format, 2dp). */
  salary_amount: string | null;
  /** Offer-only: ISO-4217 currency code (uppercase). */
  salary_currency: SalaryCurrency | null;
  /** ISO-8601 creation timestamp. */
  created_at: string;
  /** ISO-8601 last-update timestamp, or null if never updated. */
  updated_at: string | null;
}

/** Fields shared by every event type in the create/update body. */
interface TimelineEventBodyBase {
  /** ISO-8601 calendar date (`YYYY-MM-DD`). Required. */
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  timezone?: string | null;
  observation?: string | null;
}

/**
 * Body for a non-offer event — the three salary fields are OMITTED entirely
 * (the backend CHECK rejects them for non-offer types). `interview_type` is
 * present only when `event_type` is `"interview"` (the backend defaults a
 * missing one to `unknown`, but the form always sends it); it is 422 on any
 * other type. `denied_reason` (KODI-014) is present only when `event_type` is
 * `"denied"` (the backend defaults a missing one to `unknown`, but the form
 * always sends it); it is 422 on any other type.
 */
export interface NonOfferTimelineEventPayload extends TimelineEventBodyBase {
  event_type: Exclude<TimelineEventType, "offer">;
  interview_type?: InterviewType;
  denied_reason?: DeniedReason;
}

/**
 * Body for an `offer` event — the three salary fields are REQUIRED (DB CHECK).
 * `salary_amount` is sent as a decimal string. No `interview_type`.
 */
export interface OfferTimelineEventPayload extends TimelineEventBodyBase {
  event_type: "offer";
  salary_period: OfferSalaryPeriod;
  salary_amount: string;
  salary_currency: SalaryCurrency;
}

/**
 * Body for `POST /applications/{id}/timeline`. A discriminated union keyed on
 * `event_type` so the salary trio is statically omitted for non-offer types and
 * required for offers — mirroring the frontend zod discriminated union.
 */
export type CreateTimelineEventPayload =
  | NonOfferTimelineEventPayload
  | OfferTimelineEventPayload;

/**
 * Body for `PUT /applications/{id}/timeline/{event_id}`. The PUT is a FULL
 * replacement (not a patch), so the shape is identical to the create body.
 */
export type UpdateTimelineEventPayload = CreateTimelineEventPayload;
