import { z } from "zod";

import {
  DENIED_REASONS,
  INTERVIEW_TYPES,
  SALARY_CURRENCIES,
  type TimelineEventView,
} from "@/components/timeline/timeline-types";
import { browserTimeZone } from "@/components/timeline/timezone-options";
import type { CreateTimelineEventPayload } from "@/services/types/timeline";

/**
 * Validation + value-mapping for the add/edit timeline-event form (PRD 0008,
 * ADR 0012, KODI-014).
 *
 * A zod DISCRIMINATED UNION keyed on `event_type`, ported from mynextjob's
 * timeline-event-schema and extended with the applika-only `interview_type`
 * (mynextjob has no interview types — see the PRD's "idk if this exists in
 * mynextjob" clarification): the `interview` branch carries `interview_type`
 * (one of the 7 hardcoded types, default `unknown`) and no salary; the `offer`
 * branch REQUIRES the salary trio (period restricted to `monthly | annually`,
 * a non-negative amount, and one of the 20 currencies) and no `interview_type`;
 * the `denied` branch REQUIRES `denied_reason` (one of the 10 hardcoded
 * reasons, default `unknown`, KODI-014); `note`/`feedback` carry none of the
 * above. Scheduling fields are optional and collapse to `null` on the wire —
 * the `interview` branch is the only one that can ever WRITE a new
 * start/end/timezone from form input. A non-interview branch sends `null`
 * on CREATE, and on EDIT clears the schedule only if the event's type just
 * changed away from interview; editing an already non-interview event that
 * stays non-interview sends its STORED schedule back unchanged (see
 * `toTimelineEventPayload`'s `original` parameter, KODI-014 interim rule) —
 * so nothing stale ever reaches the API, but nothing already stored is wiped
 * by an unrelated edit either. Salary/amount numerics stay strings (they are
 * strings on the wire) — the amount is only checked to be a valid
 * non-negative number.
 */

/** Offer salary period is restricted to monthly/annually. */
const OFFER_SALARY_PERIOD_VALUES = ["monthly", "annually"] as const;

/**
 * Mirrors the backend's `_TimelineEventWrite` limits exactly
 * (`backend/app/presentation/schemas/timeline_event.py`), so a 422 is
 * unreachable from this form: `timezone` <= 100, `observation` <= 5000,
 * `salary_amount` up to 10 integer digits and 2 decimal places
 * (`max_digits=12, decimal_places=2`).
 */
const MAX_TIMEZONE = 100;
const MAX_OBSERVATION = 5000;
const SALARY_AMOUNT_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/** Shared, non-salary, non-classifier fields present on every branch. */
const commonShape = {
  event_date: z
    .string()
    .min(1, "Event date is required")
    .refine((raw) => !Number.isNaN(new Date(raw).getTime()), {
      message: "Enter a valid date",
    }),
  start_time: z.string(),
  end_time: z.string(),
  timezone: z.string().max(MAX_TIMEZONE, "Timezone is too long"),
  observation: z.string().max(MAX_OBSERVATION, "Notes are too long"),
};

/**
 * `start_time`/`end_time` must both be blank or both be set, and — when set
 * — the end must be strictly after the start (`HH:mm` compares correctly as
 * a string). Applied once, after the discriminated union, since the pair is
 * shared by every branch. Runs ONLY for `interview`: the schedule group is
 * unmounted for every other type (KODI-014), so a stray value left in form
 * state from a prior interview selection must never block a save.
 */
function validateSchedule(
  values: { event_type: string; start_time: string; end_time: string },
  ctx: z.RefinementCtx,
): void {
  if (values.event_type !== "interview") return;

  const hasStart = values.start_time.trim() !== "";
  const hasEnd = values.end_time.trim() !== "";
  if (hasStart !== hasEnd) {
    ctx.addIssue({
      code: "custom",
      path: [hasStart ? "end_time" : "start_time"],
      message: "Provide both a start and an end time, or neither",
    });
    return;
  }
  if (hasStart && hasEnd && values.end_time <= values.start_time) {
    ctx.addIssue({
      code: "custom",
      path: ["end_time"],
      message: "End time must be after start time",
    });
  }
}

/** Interview branch — `interview_type` is required (default `unknown`). No salary, no reason. */
const interviewSchema = z.object({
  event_type: z.literal("interview"),
  interview_type: z.enum(INTERVIEW_TYPES),
  denied_reason: z.string().optional(),
  ...commonShape,
  salary_period: z.string().optional(),
  salary_amount: z.string().optional(),
  salary_currency: z.string().optional(),
});

/** note/feedback branch — no `interview_type`, no `denied_reason`, no salary. */
const otherSchema = z.object({
  event_type: z.enum(["note", "feedback"]),
  interview_type: z.string().optional(),
  denied_reason: z.string().optional(),
  ...commonShape,
  salary_period: z.string().optional(),
  salary_amount: z.string().optional(),
  salary_currency: z.string().optional(),
});

/** denied branch — `denied_reason` is required (default `unknown`, KODI-014). No salary. */
const deniedSchema = z.object({
  event_type: z.literal("denied"),
  interview_type: z.string().optional(),
  denied_reason: z.enum(DENIED_REASONS, { message: "Select a reason" }),
  ...commonShape,
  salary_period: z.string().optional(),
  salary_amount: z.string().optional(),
  salary_currency: z.string().optional(),
});

/** Offer branch — the salary trio is required (DB CHECK + zod). No `interview_type`, no reason. */
const offerSchema = z.object({
  event_type: z.literal("offer"),
  interview_type: z.string().optional(),
  denied_reason: z.string().optional(),
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
    .refine((raw) => Number(raw) >= 0, { message: "Must be zero or more" })
    .refine((raw) => SALARY_AMOUNT_PATTERN.test(raw), {
      message: "Up to 10 digits and 2 decimal places",
    }),
  salary_currency: z.enum(SALARY_CURRENCIES, { message: "Select a currency" }),
});

export const timelineEventSchema = z
  .discriminatedUnion("event_type", [
    interviewSchema,
    offerSchema,
    deniedSchema,
    otherSchema,
  ])
  .superRefine(validateSchedule);

export type TimelineEventFormValues = z.infer<typeof timelineEventSchema>;

/** Local-timezone `YYYY-MM-DD` for the date input's initial value. */
function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Blank values for the create flow — defaults to a `note` on today's date.
 * `timezone` pre-fills with the browser's own zone (KODI-014): the select
 * cannot be cleared, so a create flow that never touches the field still
 * carries a real zone once the type becomes `interview`.
 */
export function emptyTimelineEventValues(): TimelineEventFormValues {
  return {
    event_type: "note",
    event_date: todayIso(),
    start_time: "",
    end_time: "",
    timezone: browserTimeZone(),
    observation: "",
    interview_type: "",
    denied_reason: "",
    salary_period: "",
    salary_amount: "",
    salary_currency: "",
  } as TimelineEventFormValues;
}

/**
 * Map a loaded event view-model into editor form values (edit flow). The
 * stored `timezone` always wins over the browser's; only an EMPTY stored
 * value (legacy note/feedback/offer/denied events, or an interview recorded
 * before this slice) falls back to `browserTimeZone()` (KODI-014).
 */
export function timelineEventToFormValues(
  event: TimelineEventView,
): TimelineEventFormValues {
  const common = {
    event_date: event.eventDate.slice(0, 10),
    start_time: event.startTime ?? "",
    end_time: event.endTime ?? "",
    timezone: event.timezone || browserTimeZone(),
    observation: event.observation ?? "",
  };

  if (event.type === "offer") {
    return {
      event_type: "offer",
      interview_type: "",
      denied_reason: "",
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
      denied_reason: "",
      ...common,
      salary_period: "",
      salary_amount: "",
      salary_currency: "",
    } as TimelineEventFormValues;
  }

  if (event.type === "denied") {
    return {
      event_type: "denied",
      interview_type: "",
      // A missing/null stored reason (pre-KODI-014 data) reads as unknown.
      denied_reason: event.deniedReason ?? "unknown",
      ...common,
      salary_period: "",
      salary_amount: "",
      salary_currency: "",
    } as TimelineEventFormValues;
  }

  return {
    event_type: event.type,
    interview_type: "",
    denied_reason: "",
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
 * Convert validated form values into the wire payload (KODI-014, revised by
 * the coordinator as a safer interim rule while the owner decides the final
 * behaviour).
 *
 * The scheduling trio is sent ONLY for `interview` from the FORM values (the
 * schedule inputs are unmounted for every other type, so a value the user
 * typed before switching types must never ride through). For every
 * non-interview type there are two cases:
 *
 * - EDITING an event whose ORIGINAL stored type was already non-interview,
 *   and that stays non-interview in this edit (`original` is passed and
 *   `original.type !== "interview"`): the stored `start_time`/`end_time`/
 *   `timezone` are sent BACK UNCHANGED, straight from `original`, never from
 *   form state — so an edit that only touches, say, the observation does not
 *   wipe a schedule a migrated event (or a prior interview edit) already
 *   carries.
 * - Everything else — a fresh CREATE (`original` is null/undefined) for a
 *   non-interview type, or an EDIT that switches the type FROM interview TO
 *   a non-interview type — sends `null` for all three, exactly as before.
 *
 * Interview behaviour is unchanged: `timezone` is nulled whenever
 * `start_time` is blank, because the `TimezoneSelect` cannot be cleared and
 * always holds a real zone, but a schedule with no start time is still no
 * schedule at all. `interview_type` is sent ONLY for interviews,
 * `denied_reason` ONLY for denied events, and the salary trio ONLY for
 * offers — all three are omitted entirely for every other type.
 */
export function toTimelineEventPayload(
  values: TimelineEventFormValues,
  original?: TimelineEventView | null,
): CreateTimelineEventPayload {
  const isInterview = values.event_type === "interview";
  const hasStart = isInterview && blankToNull(values.start_time) !== null;
  const keepsStoredSchedule =
    !isInterview && original != null && original.type !== "interview";
  const base = keepsStoredSchedule
    ? {
        event_date: values.event_date,
        start_time: original.startTime ?? null,
        end_time: original.endTime ?? null,
        timezone: original.timezone ?? null,
        observation: blankToNull(values.observation),
      }
    : {
        event_date: values.event_date,
        start_time: isInterview ? blankToNull(values.start_time) : null,
        end_time: isInterview ? blankToNull(values.end_time) : null,
        timezone: hasStart ? blankToNull(values.timezone) : null,
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

  if (values.event_type === "denied") {
    return {
      event_type: "denied",
      ...base,
      denied_reason: values.denied_reason,
    };
  }

  return {
    event_type: values.event_type,
    ...base,
  };
}
