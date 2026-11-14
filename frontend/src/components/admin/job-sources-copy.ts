import { intlLocale } from "@/i18n/intl-locale";
import { liveCopy, word } from "@/i18n/translator";

/**
 * The job sources page's words, in the active language (`admin.jobs.*`).
 * Every field is a getter; components rendering them also call `useLocale`
 * (or `useTranslations`), so a switch re-renders them. Never spread it.
 */
export const JOB_SOURCES_COPY = Object.assign(
  liveCopy("admin.jobs", [
    "title",
    "description",
    "runNow",
    "runStarted",
    /** A failed POST whose `detail` is not a string (5xx body, network). */
    "runFailed",
    "tableLabel",
    "never",
    "notRun",
    "none",
    "loading",
    "loadErrorTitle",
    "loadErrorBody",
    "retry",
    "emptyTitle",
    "emptyBody",
    "dismissNotice",
  ]),
  {
    columns: liveCopy("admin.jobs.columns", [
      "source",
      "enabled",
      "lastRun",
      "status",
      "found",
      "saved",
      "listed",
      "lastError",
    ]),
  },
);

export type JobRunStatus = "ok" | "failed" | "blocked";

/** R-033: the run's outcome in words, never colour alone. */
export const JOB_RUN_STATUS_LABEL: Readonly<Record<JobRunStatus, string>> =
  liveCopy("admin.jobs.status", ["ok", "failed", "blocked"]);

export function jobRunStatusLabel(status: JobRunStatus | null): string {
  return status ? JOB_RUN_STATUS_LABEL[status] : JOB_SOURCES_COPY.notRun;
}

/** "Collect from RemoteOK": the switch's accessible name. */
export function jobSourceSwitchLabel(name: string): string {
  return word("admin.jobs.switchLabel", { name });
}

/** `https://remoteok.com/api` reads "remoteok.com"; garbage reads as given. */
export function jobSourceHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

function utcFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(intlLocale(), { ...options, timeZone: "UTC" });
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * "Today 14:00 UTC", "Yesterday 09:00 UTC", "Oct 3 14:00 UTC" (pt-BR: "Hoje
 * 14:00 UTC", "03/10 14:00 UTC"), in the active language; the worker's
 * cron is in UTC. A component rendering it must subscribe (`useLocale`).
 */
export function formatJobLastRun(
  iso: string | null,
  now: Date = new Date(),
): string {
  if (!iso) return JOB_SOURCES_COPY.never;
  const ran = new Date(iso);
  if (Number.isNaN(ran.getTime())) return JOB_SOURCES_COPY.never;

  const clock = utcFormat({
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ran);
  const time = `${clock} UTC`;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (utcDayKey(ran) === utcDayKey(now)) {
    return word("admin.jobs.today", { time });
  }
  if (utcDayKey(ran) === utcDayKey(yesterday)) {
    return word("admin.jobs.yesterday", { time });
  }
  const sameYear = ran.getUTCFullYear() === now.getUTCFullYear();
  // pt-BR writes the compact "03/10" ("03/10/2025"): "3 de out. de 2025"
  // pushed the job sources table past its card at 1280px.
  const options: Intl.DateTimeFormatOptions =
    intlLocale() === "pt-BR"
      ? { day: "2-digit", month: "2-digit" }
      : { month: "short", day: "numeric" };
  const day = utcFormat(
    sameYear ? options : { ...options, year: "numeric" },
  ).format(ran);
  return word("admin.jobs.dayTime", { day, time });
}
