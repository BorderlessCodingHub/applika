/**
 * Display formatters for timeline events. Pure functions — safe on
 * server or client. They reuse the Applications formatters so date/salary
 * rendering stays consistent across the two surfaces, and degrade to `null` on
 * missing input so callers can render their own placeholder.
 */

import {
  formatDate,
  formatSalary,
} from "@/components/applications/application-format";
import type { TimelineEventView } from "@/components/timeline/timeline-types";

function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== "";
}

/**
 * Formats an event's calendar date, e.g. "Mon, 3 Jul 2026". Returns `null` for
 * missing/invalid input.
 */
export function formatEventDate(
  value: string | null | undefined,
): string | null {
  return formatDate(value, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Builds a scheduled time-range string, e.g. "10:00–11:00 · Europe/London".
 * `startTime`/`endTime` are `HH:mm` strings. Returns `null` when there is no
 * start time (i.e. the event is not scheduled).
 */
export function formatTimeRange(
  startTime?: string | null,
  endTime?: string | null,
  timezone?: string | null,
): string | null {
  if (!hasValue(startTime)) return null;
  const range = hasValue(endTime) ? `${startTime}–${endTime}` : startTime;
  return hasValue(timezone) ? `${range} · ${timezone}` : range;
}

/**
 * Builds the Offer salary string from the offer-only fields, e.g.
 * "GBP 160,000 /mo" (a legacy hourly offer reads "/hr"). Returns `null` if the
 * amount is missing. Delegates to the shared `formatSalary`.
 */
export function formatOfferSalary(
  event: Pick<
    TimelineEventView,
    "salaryAmount" | "salaryCurrency" | "salaryPeriod"
  >,
): string | null {
  if (!hasValue(event.salaryAmount)) return null;
  return formatSalary({
    expectedSalary: event.salaryAmount,
    currency: event.salaryCurrency,
    salaryPeriod: event.salaryPeriod,
  });
}
