import {
  agendaStartInstant,
  calendarDayIn,
  getUserTimezone,
} from "@/components/agenda/agenda-view";
import { calendarDaysBetween, parseDayKey } from "@/lib/phone-format";
import type { TimelineEvent } from "@/services/types/timeline";

/** PRD 0021: a future event; a past interview followed by a later event; any other past event. */
export type HistoryStatus = "scheduled" | "passed" | "done";

export interface HistoryEntry {
  event: TimelineEvent;
  /** The viewer's calendar day of the event, "YYYY-MM-DD". */
  day: string;
  status: HistoryStatus;
}

export interface ApplicationHistory {
  /** The first scheduled interview from now on, or `null`. */
  next: (HistoryEntry & { daysAway: number }) | null;
  /** Every event, newest first. */
  history: HistoryEntry[];
}

/** The event's timing in the agenda's terms (`agenda-view.ts` zone primitives). */
function timing(event: TimelineEvent) {
  return {
    step_date: event.event_date,
    start_time: event.start_time ?? undefined,
    timezone: event.timezone ?? undefined,
  };
}

/**
 * An application's history for the phone Application screen. A timed event
 * is ahead of `now` by its start in its own zone; an untimed interview is
 * ahead until its day is over, an untimed offer or denial only on a later
 * day (it records what happened). A past interview followed by any later
 * event "passed"; every other past event is "done".
 */
export function applicationHistory(
  events: readonly TimelineEvent[],
  now: Date,
  localTz: string = getUserTimezone(),
): ApplicationHistory {
  const today = calendarDayIn(now, localTz);
  const entries = events.map((event) => {
    const when = timing(event);
    const start = agendaStartInstant(when, localTz).getTime();
    const day = when.start_time
      ? calendarDayIn(new Date(start), localTz)
      : event.event_date;
    const future = when.start_time
      ? start > now.getTime()
      : event.event_type === "interview"
        ? event.event_date >= today
        : event.event_date > today;
    return { event, day, start, future };
  });

  const newestFirst = [...entries].sort(
    (a, b) =>
      b.start - a.start || b.event.created_at.localeCompare(a.event.created_at),
  );

  const history: HistoryEntry[] = newestFirst.map((entry) => {
    let status: HistoryStatus = "done";
    if (entry.future) status = "scheduled";
    else if (
      entry.event.event_type === "interview" &&
      entries.some((other) => other !== entry && other.start > entry.start)
    ) {
      status = "passed";
    }
    return { event: entry.event, day: entry.day, status };
  });

  const upcoming = entries
    .filter((entry) => entry.future && entry.event.event_type === "interview")
    .sort((a, b) => a.start - b.start)[0];

  return {
    next: upcoming
      ? {
          event: upcoming.event,
          day: upcoming.day,
          status: "scheduled",
          daysAway: calendarDaysBetween(
            parseDayKey(today),
            parseDayKey(upcoming.day),
          ),
        }
      : null,
    history,
  };
}
