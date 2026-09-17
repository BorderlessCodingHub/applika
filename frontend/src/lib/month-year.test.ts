import { describe, expect, it } from "vitest";

import {
  MONTH_YEAR_DISPLAY_FORMAT,
  isIsoMonth,
  isoToMonthYear,
  maskMonthYear,
  monthYearToIso,
} from "./month-year";

/**
 * The one ISO <-> `MM/yyyy` conversion (KODI-007 / AC3).
 *
 * The owner: "it's a date input but only for month and year "MM/yyyy" for both
 * start and finish". `MM/yyyy` is what the user types and reads; ISO `YYYY-MM`
 * is what is stored and what crosses the wire, and the server's format rule is
 * `^\d{4}-(0[1-9]|1[0-2])$`. This module is the only place the two meet, so
 * every rule below is asserted here and nowhere re-implemented.
 *
 * No `Date` is constructed anywhere in the module — pure string work, so there
 * is no timezone off-by-one to test for.
 */

describe("MONTH_YEAR_DISPLAY_FORMAT", () => {
  it("is the seven characters the user sees, and the input's placeholder", () => {
    expect(MONTH_YEAR_DISPLAY_FORMAT).toBe("MM/yyyy");
    expect(MONTH_YEAR_DISPLAY_FORMAT).toHaveLength(7);
  });
});

describe("isIsoMonth", () => {
  it("accepts exactly what the server's pattern accepts", () => {
    for (const value of ["2024-01", "2024-12", "1900-06", "0001-09"]) {
      expect(isIsoMonth(value), value).toBe(true);
    }
  });

  it("refuses a month outside 01-12, whatever the year", () => {
    for (const value of ["2024-00", "2024-13", "2024-1", "2024-99"]) {
      expect(isIsoMonth(value), value).toBe(false);
    }
  });

  it("refuses a day-level date, a partial value and nothing at all", () => {
    for (const value of ["2024-02-01", "2024", "02/2024", "", "   "]) {
      expect(isIsoMonth(value), JSON.stringify(value)).toBe(false);
    }
    expect(isIsoMonth(null)).toBe(false);
    expect(isIsoMonth(undefined)).toBe(false);
  });

  it("does NOT invent a year range the server does not enforce", () => {
    // The owner never set one and the API's pattern has none. A client bound
    // stricter than the server's would refuse a CV the server would keep.
    expect(isIsoMonth("1899-05")).toBe(true);
    expect(isIsoMonth("2999-05")).toBe(true);
  });
});

describe("isoToMonthYear", () => {
  it("turns a stored month into the string the user reads", () => {
    expect(isoToMonthYear("2023-02")).toBe("02/2023");
    expect(isoToMonthYear("2024-12")).toBe("12/2024");
    expect(isoToMonthYear(" 2024-12 ")).toBe("12/2024");
  });

  it("shows nothing for an empty, partial or impossible value", () => {
    for (const value of ["", "   ", "2024", "2024-13", "2024-02-01", "junk"]) {
      expect(isoToMonthYear(value), JSON.stringify(value)).toBe("");
    }
    expect(isoToMonthYear(null)).toBe("");
    expect(isoToMonthYear(undefined)).toBe("");
  });
});

describe("monthYearToIso", () => {
  it("turns what the user typed into what is stored", () => {
    expect(monthYearToIso("02/2023")).toBe("2023-02");
    expect(monthYearToIso("12/2024")).toBe("2024-12");
    expect(monthYearToIso(" 12/2024 ")).toBe("2024-12");
  });

  it("emits nothing for a half-typed or impossible value", () => {
    // A partial value must emit `""`, never a broken date: the form would
    // otherwise store `2024-1` and the server would answer 422.
    for (const value of [
      "",
      "0",
      "02",
      "02/20",
      "13/2024",
      "00/2024",
      "2/23",
    ]) {
      expect(monthYearToIso(value), JSON.stringify(value)).toBe("");
    }
    expect(monthYearToIso(null)).toBe("");
    expect(monthYearToIso(undefined)).toBe("");
  });

  it("round-trips every month of a year through both directions", () => {
    for (let month = 1; month <= 12; month += 1) {
      const iso = `2024-${String(month).padStart(2, "0")}`;
      expect(monthYearToIso(isoToMonthYear(iso)), iso).toBe(iso);
    }
  });
});

describe("maskMonthYear", () => {
  it("shows and emits the verified table, keystroke by keystroke", () => {
    // `fill("02/2023")` hands the whole string over in one `input` event, so
    // the mask has to reach the same place as six keystrokes. Each row is
    // [typed, shown, emitted].
    const table: Array<[string, string, string]> = [
      ["02/2023", "02/2023", "2023-02"],
      ["022023", "02/2023", "2023-02"],
      ["2/2023", "02/2023", "2023-02"],
      ["9", "09", ""],
      ["1", "1", ""],
      ["12", "12", ""],
      ["02/20", "02/20", ""],
      ["13/2024", "13/2024", ""],
      ["abc", "", ""],
      ["   ", "", ""],
      ["02/2023/99", "02/2023", "2023-02"],
    ];

    for (const [typed, shown, emitted] of table) {
      const masked = maskMonthYear(typed);
      expect(masked, `shown for ${JSON.stringify(typed)}`).toBe(shown);
      expect(
        monthYearToIso(masked),
        `emitted for ${JSON.stringify(typed)}`,
      ).toBe(emitted);
    }
  });

  it("zero-pads a lone digit above 1, and leaves 1 alone so December is reachable", () => {
    expect(maskMonthYear("9")).toBe("09");
    expect(maskMonthYear("1")).toBe("1");
    expect(maskMonthYear("12")).toBe("12");
  });

  it("never holds more than six digits", () => {
    expect(maskMonthYear("1220241234")).toBe("12/2024");
    expect(maskMonthYear("12/2024")).toHaveLength(
      MONTH_YEAR_DISPLAY_FORMAT.length,
    );
  });

  it("is idempotent, so the parent's echo does not rewrite the field", () => {
    for (const value of ["02/2023", "02/20", "09", "1", ""]) {
      expect(maskMonthYear(maskMonthYear(value)), value).toBe(
        maskMonthYear(value),
      );
    }
  });
});
