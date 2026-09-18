import { z } from "zod";

import {
  INTERVIEW_TYPES,
  SALARY_CURRENCIES,
  type TimelineEventView,
} from "@/components/timeline/timeline-types";
import type { CreateTimelineEventPayload } from "@/services/types/timeline";

/**
 * Validation + value-mapping for the add/edit timeline-event form (PRD 0008,
 * ADR 0012).
 *
 * A zod DISCRIMINATED UNION keyed on `event_type`, ported from mynextjob's
 * timeline-event-schema and extended with the applika-only `interview_type`
 * (mynextjob has no interview types — see the PRD's "idk if this exists in
 * mynextjob" clarification): the `interview` branch carries `interview_type`
 * (one of the 7 hardcoded types, default `unknown`) and no salary; the `offer`
 * branch REQUIRES the salary trio (period restricted to `monthly | annually`,
 * a non-negative amount, and one of the 20 currencies) and no `interview_type`;
 * every other type (`note`/`feedback`/`denied`) carries neither. Scheduling
 * fields are optional and collapse to `null` on the wire. Salary/amount
 * numerics stay strings (they are strings on the wire) — the amount is only
 * checked to be a valid non-negative number.
 */

/** Offer salary period is restricted to monthly/annually. */
const OFFER_SALARY_PERIOD_VALUES = ["monthly", "annually"] as const;

/** Shared, non-salary, non-interview-type fields present on every branch. */
const commonShape = {
  event_date: z
    .string()
    .min(1, "Event date is required")
    .refine((raw) => !Number.isNaN(new Date(raw).getTime()), {
      message: "Enter a valid date",
    }),
  start_time: z.string(),
  end_time: z.string(),
  timezone: z.string(),
  observation: z.string(),
};

/** Interview branch — `interview_type` is required (default `unknown`). No salary. */
const interviewSchema = z.object({
  event_type: z.literal("interview"),
  interview_type: z.enum(INTERVIEW_TYPES),
  ...commonShape,
  salary_period: z.string().optional(),
  salary_amount: z.string().optional(),
  salary_currency: z.string().optional(),
});

/** note/feedback/denied branch — no `interview_type`, no salary constraint. */
const otherSchema = z.object({
  event_type: z.enum(["note", "feedback", "denied"]),
  interview_type: z.string().optional(),
  ...commonShape,
  salary_period: z.string().optional(),
  salary_amount: z.string().optional(),
  salary_currency: z.string().optional(),
});

/** Offer branch — the salary trio is required (DB CHECK + zod). No `interview_type`. */
const offerSchema = z.object({
  event_type: z.literal("offer"),
  interview_type: z.string().optional(),
  ...commonShape,
  salary_period: z.enum(OFFER_SALARY_PERIOD_VALUES, {
    message: "Select a salary period",
  }),
  salary_amount: z
    .string()
    .trim()
    .min(1, "Enter the offered amount")
    .refine((raw) => Number.isFinite(Number(raw)), {
      message: "Enter a valid number",
    })
    .refine((raw) => Number(raw) >= 0, { message: "Must be zero or more" }),
  salary_currency: z.enum(SALARY_CURRENCIES, { message: "Select a currency" }),
});

export const timelineEventSchema = z.discriminatedUnion("event_type", [
  interviewSchema,
  offerSchema,
  otherSchema,
]);

export type TimelineEventFormValues = z.infer<typeof timelineEventSchema>;

/** Local-timezone `YYYY-MM-DD` for the date input's initial value. */
function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Blank values for the create flow — defaults to a `note` on today's date. */
export function emptyTimelineEventValues(): TimelineEventFormValues {
  return {
    event_type: "note",
    event_date: todayIso(),
    start_time: "",
    end_time: "",
    timezone: "",
    observation: "",
    interview_type: "",
    salary_period: "",
    salary_amount: "",
    salary_currency: "",
  } as TimelineEventFormValues;
}

/** Map a loaded event view-model into editor form values (edit flow). */
export function timelineEventToFormValues(
  event: TimelineEventView,
): TimelineEventFormValues {
  const common = {
    event_date: event.eventDate.slice(0, 10),
    start_time: event.startTime ?? "",
    end_time: event.endTime ?? "",
    timezone: event.timezone ?? "",
    observation: event.observation ?? "",
  };

  if (event.type === "offer") {
    return {
      event_type: "offer",
      interview_type: "",
      ...common,
      // A legacy hourly offer rides through as-is; the salary-period toggle
      // then shows nothing selected and the zod enum blocks save until the
      // user picks monthly or annually (LEGACY_HOURLY_OFFER_HINT).
      salary_period:
        event.salaryPeriod === "monthly" || event.salaryPeriod === "annually"
          ? event.salaryPeriod
          : "",
      salary_amount: event.salaryAmount ?? "",
      // A stored offer always carries a valid currency; fall back defensively.
      salary_currency: (event.salaryCurrency ??
        "USD") as (typeof SALARY_CURRENCIES)[number],
    } as TimelineEventFormValues;
  }

  if (event.type === "interview") {
    return {
      event_type: "interview",
      interview_type: event.interviewType ?? "unknown",
      ...common,
      salary_period: "",
      salary_amount: "",
      salary_currency: "",
    } as TimelineEventFormValues;
  }

  return {
    event_type: event.type,
    interview_type: "",
    ...common,
    salary_period: "",
    salary_amount: "",
    salary_currency: "",
  } as TimelineEventFormValues;
}

/** Trim a string; return `null` when blank so the API stores nothing. */
function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Convert validated form values into the wire payload. The scheduling trio
 * collapses blanks to `null`; `interview_type` is sent ONLY for interviews and
 * the salary trio ONLY for offers — both are omitted entirely for every other
 * type.
 */
export function toTimelineEventPayload(
  values: TimelineEventFormValues,
): CreateTimelineEventPayload {
  const base = {
    event_date: values.event_date,
    start_time: blankToNull(values.start_time),
    end_time: blankToNull(values.end_time),
    timezone: blankToNull(values.timezone),
    observation: blankToNull(values.observation),
  };

  if (values.event_type === "interview") {
    return {
      event_type: "interview",
      interview_type: values.interview_type,
      ...base,
    };
  }

  if (values.event_type === "offer") {
    return {
      event_type: "offer",
      ...base,
      salary_period: values.salary_period,
      salary_amount: values.salary_amount.trim(),
      salary_currency: values.salary_currency,
    };
  }

  return {
    event_type: values.event_type,
    ...base,
  };
}
