"use client";

import { useFormatter, useLocale } from "next-intl";

import type { UserSession } from "@/services/types/sessions";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const WEEK_MS = 7 * 24 * HOUR_MS;

const DATE = {
  month: "short",
  day: "numeric",
  year: "numeric",
} as const;

/** The active MCP connections of a sessions list, in the server's order. */
export function activeMcpSessions(
  sessions: readonly UserSession[] | undefined,
): UserSession[] {
  return (sessions ?? []).filter(
    (session) => session.client_type === "mcp" && session.status === "active",
  );
}

/** Whole calendar days from `then` to `now`, in the viewer's zone. */
function calendarDays(then: Date, now: Date): number {
  const day = (value: Date) =>
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  return Math.round((day(now) - day(then)) / (24 * HOUR_MS));
}

/**
 * The boards' dates: "Nov 14, 2026" (no time: the end can trail Redis by up
 * to a day, ADR-0028), and "Last used" as "2 minutes ago", "Yesterday" or
 * "3 days ago" within a week of `now`, a date after that.
 */
export function useMcpDates(now: Date) {
  const format = useFormatter();
  const locale = useLocale();

  const date = (iso: string): string => {
    const value = new Date(iso);
    return Number.isNaN(value.getTime()) ? iso : format.dateTime(value, DATE);
  };

  const lastUsed = (iso: string): string => {
    const value = new Date(iso);
    if (Number.isNaN(value.getTime())) return iso;
    const ago = now.getTime() - value.getTime();
    if (ago >= WEEK_MS) return date(iso);
    // `numeric: "auto"` says "now" and "yesterday", which next-intl's relativeTime does not.
    const words = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const days = calendarDays(value, now);
    const text =
      ago < MINUTE_MS
        ? words.format(0, "second")
        : ago < HOUR_MS
          ? words.format(-Math.floor(ago / MINUTE_MS), "minute")
          : days <= 0
            ? words.format(-Math.floor(ago / HOUR_MS), "hour")
            : words.format(-days, "day");
    return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  };

  return { date, lastUsed };
}
