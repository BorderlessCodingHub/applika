/**
 * DTO → view-model mapping for the application timeline (PRD 0008, ADR 0012).
 *
 * The wire DTO (`@/services/types/timeline`) is snake_case; the design-system
 * components render camelCase view-models (`@/components/timeline/
 * timeline-types`). This is the single place that bridges the two — the data
 * layer maps once here so components never see the raw DTO. Salary numerics stay
 * strings (they only ever get formatted for display).
 */

import type { TimelineEventView } from "@/components/timeline/timeline-types";
import type { TimelineEvent } from "@/services/types/timeline";

/**
 * The API sends times as `HH:MM:SS`; the view-model (and `<input type="time">`
 * in the edit form) is `HH:mm`. Trim once, here.
 */
function toHourMinute(value: string | null): string | null {
  return value == null ? null : value.slice(0, 5);
}

/** Map a single timeline event DTO into its card/list view-model. */
export function toTimelineEventView(event: TimelineEvent): TimelineEventView {
  return {
    id: event.id,
    type: event.event_type,
    interviewType: event.interview_type,
    eventDate: event.event_date,
    startTime: toHourMinute(event.start_time),
    endTime: toHourMinute(event.end_time),
    timezone: event.timezone,
    observation: event.observation,
    salaryPeriod: event.salary_period,
    salaryAmount: event.salary_amount,
    salaryCurrency: event.salary_currency,
  };
}

/**
 * Sort events newest-first by calendar date, tie-breaking on `created_at` (both
 * descending) so same-day events keep a stable, most-recent-first order. Sorts a
 * copy — the input array is left untouched — then maps each to a view-model.
 */
export function toTimelineEventViews(
  events: TimelineEvent[],
): TimelineEventView[] {
  return [...events]
    .sort((a, b) => {
      if (a.event_date !== b.event_date) {
        return a.event_date < b.event_date ? 1 : -1;
      }
      if (a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      return 0;
    })
    .map(toTimelineEventView);
}
