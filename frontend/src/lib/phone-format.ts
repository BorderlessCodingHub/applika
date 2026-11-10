import {
  agendaStartInstant,
  calendarDayIn,
  getUserTimezone,
  isStepPast,
} from "@/components/agenda/agenda-view";
import type {
  InterviewType,
  TimelineEventType,
} from "@/components/timeline/timeline-types";
import type { AgendaStep } from "@/services/types/applications";
import type { User } from "@/services/types/users";

type Named = Pick<User, "username" | "first_name" | "last_name">;

const clean = (value: string | null | undefined) => value?.trim() ?? "";

/**
 * The avatar's letters, the desktop profile's rule (`UserProfileAvatar`):
 * first and last name's first letters when both are set, else the
 * username's first two. Uppercased, as the boards draw them.
 */
export function initials(user: Named): string {
  const first = clean(user.first_name);
  const last = clean(user.last_name);
  const letters =
    first && last ? first[0] + last[0] : user.username.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * The name a phone screen greets: "first last" (the last name only with a
 * first one), else the username (PRD 0021 edge case: no first name).
 */
export function displayName(user: Named): string {
  const first = clean(user.first_name);
  if (!first) return user.username;
  return `${first} ${clean(user.last_name)}`.trim();
}

/** A company's tile letters: the first letters of its first two words, else its first two. */
export function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

/** The part of the day Today's greeting names. */
export type DayPart = "morning" | "afternoon" | "evening";

/**
 * When the next interview starts: minutes from now while it is within a day
 * ("in 2h 15m"), else its local day ("Tue, Oct 28").
 */
export type TimeToStart =
  | { kind: "soon"; minutes: number }
  | { kind: "later"; date: Date };

/**
 * Today's greeting by the local hour: morning 05:00–11:59, afternoon
 * 12:00–17:59, evening 18:00–04:59.
 */
export function dayPart(now: Date): DayPart {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/** The name Today greets: the first name, else the username (PRD 0021 edge case). */
export function greetingName(user: Named): string {
  return clean(user.first_name) || user.username;
}

/** Today's h1: the part of the day and the name ("Good afternoon, Sam"). */
export function greeting(
  now: Date,
  user: Named,
): { part: DayPart; name: string } {
  return { part: dayPart(now), name: greetingName(user) };
}

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;

/**
 * How long until `start`: the minutes while it is less than a day away
 * ("in 2h 15m", never below zero), else its day ("Tue, Oct 28").
 */
export function timeToStart(start: Date, now: Date): TimeToStart {
  const minutes = (start.getTime() - now.getTime()) / MINUTE;
  if (minutes < DAY_MINUTES) {
    return { kind: "soon", minutes: Math.max(0, minutes) };
  }
  return { kind: "later", date: start };
}

/** A local calendar day's key, "YYYY-MM-DD" (never `toISOString`, which is UTC). */
export function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "YYYY-MM-DD" (or a longer ISO string) at local midnight: never `new Date("YYYY-MM-DD")`, which is UTC. */
export function parseDayKey(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** `date`'s local midnight moved by `days` calendar days (DST-safe). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The Monday of `date`'s ISO week, at local midnight. */
export function mondayOf(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

/** Whole calendar days from `from` to `to` (both read as local days). */
export function calendarDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / (24 * 60 * MINUTE));
}

type AgendaTiming = Pick<AgendaStep, "step_date" | "start_time" | "timezone">;

/**
 * The viewer's calendar day an agenda item falls on, "YYYY-MM-DD": a timed
 * item's start read in `localTz`, an untimed one's `step_date`.
 */
export function agendaDay(
  step: AgendaTiming,
  localTz: string = getUserTimezone(),
): string {
  if (!step.start_time) return step.step_date;
  return calendarDayIn(agendaStartInstant(step, localTz), localTz);
}

/**
 * The items not started yet (`isStepPast`: a timed one by its start in its
 * own zone, an untimed one until its day is over), soonest first.
 */
export function upcomingAgenda<T extends AgendaStep>(
  items: readonly T[],
  now: Date,
  localTz: string = getUserTimezone(),
): T[] {
  return items
    .filter((step) => !isStepPast(step, now, localTz))
    .sort(
      (a, b) =>
        agendaStartInstant(a, localTz).getTime() -
        agendaStartInstant(b, localTz).getTime(),
    );
}

/** Today's next interview: the first item starting at or after `now`, else `null`. */
export function nextInterview<T extends AgendaStep>(
  items: readonly T[],
  now: Date,
  localTz: string = getUserTimezone(),
): T | null {
  return upcomingAgenda(items, now, localTz)[0] ?? null;
}

/**
 * When an agenda item starts, for its card: a timed one through
 * `timeToStart`; an untimed one by its day.
 */
export function agendaTimeToStart(
  step: AgendaTiming,
  now: Date,
  localTz: string = getUserTimezone(),
): TimeToStart {
  if (!step.start_time) {
    return { kind: "later", date: parseDayKey(step.step_date) };
  }
  return timeToStart(agendaStartInstant(step, localTz), now);
}

/**
 * The boards' stage title ("Technical interview", "Initial screening",
 * "Offer"), a key under `phone.stageTitle`. An interview with no type is
 * "Interview".
 */
export function stageTitleKey(
  eventType: TimelineEventType,
  interviewType?: InterviewType | null,
): string {
  if (eventType !== "interview") return eventType;
  return `interview.${interviewType ?? "unknown"}`;
}

/**
 * v2/Schedule's stage pill ("Technical", "Initial screening"): the interview
 * type's words, else the event type's ("Interview", "Offer"). A full key.
 */
export function stagePillKey(
  eventType: TimelineEventType,
  interviewType?: InterviewType | null,
): string {
  if (
    eventType === "interview" &&
    interviewType &&
    interviewType !== "unknown"
  ) {
    return `timeline.interviewType.${interviewType}`;
  }
  return `timeline.eventType.${eventType}`;
}
