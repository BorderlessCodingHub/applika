import type { AgendaDisplayTime } from "@/components/agenda/agenda-item-card";
import type { AgendaStep } from "@/services/types/applications";

/** Parse "HH:MM" or "HH:MM:SS" into [hours, minutes]. */
export function parseTime(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number);
  return [h, m];
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/**
 * How far `timeZone`'s wall clock is AHEAD of UTC, in ms, at the instant
 * `date` represents. Uses `Intl.DateTimeFormat` with an explicit `timeZone`,
 * which reads that zone's own rules regardless of the PROCESS's `TZ` — unlike
 * `Date#getHours()`/`Date#toLocaleString()` with no `timeZone` option, which
 * both read the process zone and silently give a different answer in CI
 * (UTC) than on a developer's machine.
 */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );

  return asIfUtc - date.getTime();
}

/**
 * The absolute instant a wall-clock "YYYY-MM-DD"/"HH:MM[:SS]" pair means in
 * `timeZone` — independent of the process's own `TZ` (see
 * `timeZoneOffsetMs`). This is the one place agenda dates/times become a real
 * instant; everything else (`isStepPast`, `splitAgenda`, `convertToLocalTime`)
 * goes through it so the zone math lives in a single, testable spot.
 */
function zonedTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = parseTime(timeStr);
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Resolve the zone's offset AT that wall-clock instant (DST-correct enough
  // for agenda purposes: a step never straddles its own zone's transition).
  const offset = timeZoneOffsetMs(new Date(asIfUtc), timeZone);
  return new Date(asIfUtc - offset);
}

/**
 * Convert a time string from one timezone to the local system timezone.
 * Returns the converted "HH:MM" string. `localTz` is injectable for tests.
 */
export function convertToLocalTime(
  dateStr: string,
  timeStr: string,
  fromTz: string,
  localTz: string = getUserTimezone(),
): string {
  const instant = zonedTimeToUtc(dateStr, timeStr, fromTz);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: localTz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/**
 * Display time for a step, converting timezone if needed. `AgendaDisplayTime`
 * is the shape `AgendaItemCard` renders — see `agenda-item-card.tsx`. `null`
 * for a step with no `start_time` (the card then shows "All day").
 */
export function getDisplayTime(
  step: AgendaStep,
  localTz: string = getUserTimezone(),
): AgendaDisplayTime | null {
  if (!step.start_time) return null;

  const stepTz = step.timezone;
  const needsConversion = !!stepTz && stepTz !== localTz;

  const time = needsConversion
    ? convertToLocalTime(step.step_date, step.start_time, stepTz!, localTz)
    : step.start_time.slice(0, 5);

  const endTime = step.end_time
    ? needsConversion
      ? convertToLocalTime(step.step_date, step.end_time, stepTz!, localTz)
      : step.end_time.slice(0, 5)
    : undefined;

  return { time, endTime, converted: needsConversion };
}

/** The step's own start instant, in the viewer's zone if it carries no timezone. */
function stepStartInstant(step: AgendaStep, localTz: string): Date {
  return zonedTimeToUtc(
    step.step_date,
    step.start_time ?? "00:00:00",
    step.timezone ?? localTz,
  );
}

/** "YYYY-MM-DD" for `now`, as read in `timeZone` — never the process's own zone. */
function calendarDayIn(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Whether a step has already started, relative to `now`. A step with no
 * `start_time` is never past until its calendar day is over (R-005), where
 * "its calendar day" is judged in `localTz` — the viewer's own zone, since an
 * untimed step carries no zone of its own. `localTz` is injectable for tests.
 *
 * A TIMED step is judged purely on its real start INSTANT — never on a
 * `step_date`-vs-"today" comparison first. `step_date` is the day in the
 * STEP's own zone (or none at all), which is not always the viewer's calendar
 * day; short-circuiting on it moved a step to the wrong tab up to a day early
 * or late whenever the step's zone and the viewer's zone disagreed on what
 * day it currently is (e.g. a Tokyo evening step, viewed from São Paulo,
 * still hasn't "arrived" at its `step_date` there). The instant comparison
 * alone is correct at any distance, so there is no shortcut worth keeping.
 */
export function isStepPast(
  step: AgendaStep,
  now: Date,
  localTz: string = getUserTimezone(),
): boolean {
  if (step.start_time) {
    return stepStartInstant(step, localTz) < now;
  }

  // Untimed: never past until its own calendar day (read in localTz) is over.
  const today = calendarDayIn(now, localTz);
  return step.step_date < today;
}

export interface SplitAgenda {
  /** Not started yet, soonest first. */
  upcoming: AgendaStep[];
  /** Already started, most recent first. */
  past: AgendaStep[];
}

/**
 * Sort key: `step_date` is the PRIMARY key (so a group's cards never
 * interleave with another date's, whatever each step's own zone is), the
 * step's start instant is the tie-break WITHIN one date — two cards on the
 * same `step_date` but in different zones still land in true chronological
 * order relative to each other.
 */
function compareSteps(a: AgendaStep, b: AgendaStep, localTz: string): number {
  if (a.step_date !== b.step_date) return a.step_date < b.step_date ? -1 : 1;
  const diff =
    stepStartInstant(a, localTz).getTime() -
    stepStartInstant(b, localTz).getTime();
  return diff === 0 ? 0 : diff < 0 ? -1 : 1;
}

/**
 * Split agenda items into Upcoming (soonest first) and Past (most recent
 * first). `now`/`localTz` are injectable so a test never depends on the
 * clock or the runner's timezone (R-005).
 */
export function splitAgenda(
  items: AgendaStep[],
  now: Date = new Date(),
  localTz: string = getUserTimezone(),
): SplitAgenda {
  const upcoming: AgendaStep[] = [];
  const past: AgendaStep[] = [];

  for (const step of items) {
    if (isStepPast(step, now, localTz)) {
      past.push(step);
    } else {
      upcoming.push(step);
    }
  }

  upcoming.sort((a, b) => compareSteps(a, b, localTz));
  past.sort((a, b) => compareSteps(b, a, localTz));

  return { upcoming, past };
}

export interface AgendaDateGroupData {
  date: string;
  steps: AgendaStep[];
}

/**
 * Group already-ordered items by `step_date`, preserving the incoming order
 * both across and within groups (R-006).
 */
export function groupByDate(items: AgendaStep[]): AgendaDateGroupData[] {
  const groups: AgendaDateGroupData[] = [];
  const byDate = new Map<string, AgendaDateGroupData>();

  for (const step of items) {
    let group = byDate.get(step.step_date);
    if (!group) {
      group = { date: step.step_date, steps: [] };
      byDate.set(step.step_date, group);
      groups.push(group);
    }
    group.steps.push(step);
  }

  return groups;
}

export interface AgendaFilter {
  search?: string;
  /** `"all"` (or omitted) keeps every interview type. */
  interviewType?: string;
}

/**
 * Case-insensitive substring match on company name OR role (R-009) — the two
 * fields are checked separately, never concatenated, so a search matching a
 * word from each field (e.g. "acme senior" against company "Acme"/role
 * "Senior Engineer") correctly finds nothing. Plus an exact interview-type
 * match (R-010). Run BEFORE `splitAgenda`/`groupByDate` so both tab counts
 * follow the filter.
 */
export function filterAgenda(
  items: AgendaStep[],
  filter: AgendaFilter,
): AgendaStep[] {
  const search = filter.search?.trim().toLowerCase();
  const interviewType = filter.interviewType;

  return items.filter((step) => {
    if (search) {
      const company = step.company_name.toLowerCase();
      const role = step.role.toLowerCase();
      if (!company.includes(search) && !role.includes(search)) return false;
    }
    if (interviewType && interviewType !== "all") {
      if (step.interview_type !== interviewType) return false;
    }
    return true;
  });
}
