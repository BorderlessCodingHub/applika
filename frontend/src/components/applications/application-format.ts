/**
 * Display formatters for Applications. Salary numerics arrive as strings on
 * the wire, so these accept strings and degrade gracefully on missing/invalid
 * input. Numbers and dates are written the way the active language writes
 * them (`intlLocale`, read at call time): a component rendering the result
 * subscribes (`useLocale`), so a switch re-renders it.
 */

import { SALARY_PERIOD_SUFFIXES } from "@/components/timeline/timeline-options";
import type { SalaryPeriod } from "@/components/timeline/timeline-types";
import { intlLocale } from "@/i18n/intl-locale";
import { word } from "@/i18n/translator";

/** The salary-related fields needed to build a display string. */
export interface SalaryParts {
  expectedSalary?: string | null;
  salaryRangeMin?: string | null;
  salaryRangeMax?: string | null;
  /** ISO-4217 currency code, e.g. "GBP". */
  currency?: string | null;
  /** Salary period token, e.g. "annually". */
  salaryPeriod?: string | null;
}

function hasValue(value: string | null | undefined): value is string {
  return value != null && value.trim() !== "";
}

/** Formats a numeric string with the language's grouping; falls back to the raw string. */
function formatAmount(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  // Cents only when there are any: "160000.00" -> 160,000 but "25.50" -> 25.50.
  const digits = Number.isInteger(n) ? 0 : 2;
  return new Intl.NumberFormat(intlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
}

/**
 * Builds a human-readable salary string from the (nullable, string) salary
 * fields. Prefers an explicit expected salary, then a min–max range, then a
 * single-sided bound. Returns `null` when nothing is available so callers can
 * render their own placeholder (e.g. "Not listed").
 *
 * @example
 * formatSalary({ expectedSalary: "160000", currency: "GBP", salaryPeriod: "annually" })
 * // "GBP 160,000 /yr"
 */
export function formatSalary(parts: SalaryParts): string | null {
  const {
    expectedSalary,
    salaryRangeMin,
    salaryRangeMax,
    currency,
    salaryPeriod,
  } = parts;

  const prefix = hasValue(currency) ? `${currency} ` : "";
  const periodLabel = hasValue(salaryPeriod)
    ? (SALARY_PERIOD_SUFFIXES[salaryPeriod as SalaryPeriod] ?? salaryPeriod)
    : null;
  const suffix = periodLabel ? ` ${periodLabel}` : "";

  if (hasValue(expectedSalary)) {
    return `${prefix}${formatAmount(expectedSalary)}${suffix}`;
  }
  if (hasValue(salaryRangeMin) && hasValue(salaryRangeMax)) {
    return `${prefix}${formatAmount(salaryRangeMin)} – ${formatAmount(salaryRangeMax)}${suffix}`;
  }
  if (hasValue(salaryRangeMin)) {
    return `${prefix}${formatAmount(salaryRangeMin)}+${suffix}`;
  }
  if (hasValue(salaryRangeMax)) {
    return word("applications.salary.upTo", {
      amount: `${prefix}${formatAmount(salaryRangeMax)}${suffix}`,
    });
  }
  return null;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats an ISO date string for display. Returns `null` for missing/invalid
 * input so callers can render an em-dash placeholder.
 */
export function formatDate(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string | null {
  if (!hasValue(value)) return null;
  // `new Date("YYYY-MM-DD")` is UTC midnight: west of UTC it prints the day before.
  const day = DATE_ONLY.exec(value);
  const date = day
    ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(intlLocale(), options);
}

/**
 * An application's `YYYY-MM-DD` day as the row shows it: English keeps the
 * ISO day it has always shown (byte-identical); Portuguese writes `dd/MM/yyyy`.
 * Components pass `useLocale()`; without it the active language is read.
 */
export function formatApplicationDay(
  value: string,
  locale: string = intlLocale(),
): string {
  const day = DATE_ONLY.exec(value);
  if (locale !== "pt-BR" || !day) return value;
  return `${day[3]}/${day[2]}/${day[1]}`;
}
