import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isNotFutureCalendarDay,
  localCalendarDay,
} from "@/components/application-drafts/draft-copy";

/**
 * KODI-036, AC1 (frontend-qa round 1, B1): the application-date "not in the
 * future" check compares CALENDAR STRINGS, never `Date` objects. A
 * `Date`-object comparison (`new Date(v) <= new Date()`) used to refuse a
 * user's own TODAY whenever their local calendar day was already ahead of
 * UTC's — most of Asia/Oceania at any hour, and Europe past midnight. These
 * are plain string comparisons, so no `TZ` stubbing is needed to prove it.
 */

describe("isNotFutureCalendarDay", () => {
  it("accepts today", () => {
    expect(isNotFutureCalendarDay("2026-09-26", "2026-09-26")).toBe(true);
  });

  it("accepts any day before today", () => {
    expect(isNotFutureCalendarDay("2026-01-01", "2026-09-26")).toBe(true);
    expect(isNotFutureCalendarDay("2025-12-31", "2026-09-26")).toBe(true);
  });

  it("refuses a day after today", () => {
    expect(isNotFutureCalendarDay("2026-09-27", "2026-09-26")).toBe(false);
    expect(isNotFutureCalendarDay("2027-01-01", "2026-09-26")).toBe(false);
  });

  it("defaults `today` to the browser's own local calendar day", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 26, 12, 0, 0));

    expect(isNotFutureCalendarDay("2026-09-26")).toBe(true);
    expect(isNotFutureCalendarDay("2026-09-27")).toBe(false);
    expect(isNotFutureCalendarDay(localCalendarDay())).toBe(true);

    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
