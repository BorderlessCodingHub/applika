export const JOB_SOURCES_COPY = {
  title: "Job sources",
  description:
    "The background worker collects jobs every hour from each source that is on. Runs never overlap.",
  runNow: "Run now",
  runStarted: "Run started",
  /** A failed POST whose `detail` is not a string (5xx body, network). */
  runFailed: "Could not start a run. Try again.",
  tableLabel: "Job sources",
  columns: {
    source: "Source",
    enabled: "On",
    lastRun: "Last run",
    status: "Status",
    found: "Found",
    saved: "Saved",
    listed: "Listed jobs",
    lastError: "Last error",
  },
  never: "Never",
  notRun: "Not run yet",
  none: "None",
  loading: "Loading job sources",
  loadErrorTitle: "Could not load job sources",
  loadErrorBody: "The list did not load. Check your connection and try again.",
  retry: "Try again",
  emptyTitle: "No job sources yet",
  emptyBody:
    "Himalayas and RemoteOK appear here once the database upgrade that adds them has run.",
  dismissNotice: "Dismiss message",
} as const;

export type JobRunStatus = "ok" | "failed" | "blocked";

/** R-033: the run's outcome in words, never colour alone. */
export const JOB_RUN_STATUS_LABEL: Record<JobRunStatus, string> = {
  ok: "OK",
  failed: "Failed",
  blocked: "Blocked",
};

export function jobRunStatusLabel(status: JobRunStatus | null): string {
  return status ? JOB_RUN_STATUS_LABEL[status] : JOB_SOURCES_COPY.notRun;
}

/** "Collect from RemoteOK": the switch's accessible name. */
export function jobSourceSwitchLabel(name: string): string {
  return `Collect from ${name}`;
}

/** `https://remoteok.com/api` reads "remoteok.com"; garbage reads as given. */
export function jobSourceHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

const UTC_TIME = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const UTC_DAY = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const UTC_DAY_YEAR = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Today 14:00 UTC", "Yesterday 09:00 UTC", "Oct 3 14:00 UTC"; the worker's cron is in UTC. */
export function formatJobLastRun(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return JOB_SOURCES_COPY.never;
  const ran = new Date(iso);
  if (Number.isNaN(ran.getTime())) return JOB_SOURCES_COPY.never;

  const time = `${UTC_TIME.format(ran)} UTC`;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (utcDayKey(ran) === utcDayKey(now)) return `Today ${time}`;
  if (utcDayKey(ran) === utcDayKey(yesterday)) return `Yesterday ${time}`;
  const day =
    ran.getUTCFullYear() === now.getUTCFullYear()
      ? UTC_DAY.format(ran)
      : UTC_DAY_YEAR.format(ran);
  return `${day} ${time}`;
}
