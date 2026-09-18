/**
 * A CV date: a month and a year, never a day.
 *
 * It lives in two shapes. STORED and carried on the wire as ISO `YYYY-MM`;
 * TYPED and READ as `MM/yyyy`. `MonthYearInput` is the only control that
 * produces one and `formatCvDatePeriod` (`base-cvs/cv-document.tsx`) is the
 * only thing that prints one, and both translate through here so there is a
 * single implementation of the two directions.
 */

/** What the user types and reads. Doubles as the input's placeholder. */
export const MONTH_YEAR_DISPLAY_FORMAT = "MM/yyyy";

const MONTH_DIGITS = 2;
const YEAR_DIGITS = 4;
const TOTAL_DIGITS = MONTH_DIGITS + YEAR_DIGITS;

/** ISO `YYYY-MM`, month 01-12. */
const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `MM/yyyy`, month 01-12. */
const DISPLAY_MONTH_YEAR = /^(0[1-9]|1[0-2])\/(\d{4})$/;

/** True for a complete ISO `YYYY-MM`. A day-level date is NOT one. */
export function isIsoMonth(value: string | null | undefined): boolean {
  return ISO_MONTH.test((value ?? "").trim());
}

/**
 * ISO `YYYY-MM` to `MM/yyyy`. Anything else — `""`, a partial value, a
 * day-level date, month 13 — returns `""`.
 */
export function isoToMonthYear(value: string | null | undefined): string {
  const match = ISO_MONTH.exec((value ?? "").trim());
  return match ? `${match[2]}/${match[1]}` : "";
}

/**
 * `MM/yyyy` to ISO `YYYY-MM`. A partial or impossible value returns `""`, so a
 * half-typed field emits nothing rather than a broken date.
 */
export function monthYearToIso(display: string | null | undefined): string {
  const match = DISPLAY_MONTH_YEAR.exec((display ?? "").trim());
  return match ? `${match[2]}-${match[1]}` : "";
}

/**
 * The typed characters reduced to what `MM/yyyy` can hold: digits only, the
 * separator inserted for the user, six digits at most.
 *
 * It accepts a whole string at once, so `fill("02/2023")` and six keystrokes
 * land on the same value.
 */
export function maskMonthYear(raw: string): string {
  // A single digit before the separator is an unpadded month: "2/2023" is
  // February, so pad it before the separator is thrown away.
  const unpadded = /^(\d)\D+(\d+)/.exec(raw.trim());
  const source = unpadded ? `0${unpadded[1]}${unpadded[2]}` : raw;

  let digits = source.replace(/\D/g, "").slice(0, TOTAL_DIGITS);

  // A lone digit above 1 can only be a zero-padded month: 9 is 09, not 90.
  if (digits.length === 1 && Number(digits) > 1) {
    digits = `0${digits}`;
  }

  if (digits.length <= MONTH_DIGITS) {
    return digits;
  }
  return `${digits.slice(0, MONTH_DIGITS)}/${digits.slice(MONTH_DIGITS)}`;
}
