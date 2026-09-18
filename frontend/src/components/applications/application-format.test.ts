import { describe, expect, it } from "vitest";

import { formatSalary } from "@/components/applications/application-format";

/**
 * AC22 (KODI-013 addendum) — owner: "ISO code everywhere (Recommended)".
 * Application rows show the ISO currency code (e.g. "SEK 50,000"), never a
 * symbol, exactly like the timeline cards (`timeline-format.ts`'s
 * `formatOfferSalary` already delegates to this same function). Pinned across
 * every currency the owner named plus the three salary shapes a row can show:
 * a single expected amount, a min–max range, and each one-sided bound.
 */
describe("formatSalary (AC22 — ISO code, never a symbol)", () => {
  it.each([
    ["SEK", "SEK 50,000"],
    ["NOK", "NOK 50,000"],
    ["DKK", "DKK 50,000"],
    ["USD", "USD 50,000"],
    ["EUR", "EUR 50,000"],
  ])("prints the ISO code for %s, never a symbol", (currency, expected) => {
    const result = formatSalary({
      expectedSalary: "50000",
      currency,
      salaryPeriod: null,
    });
    expect(result).toBe(expected);
  });

  it("formats a min–max range with one currency prefix and one period suffix", () => {
    expect(
      formatSalary({
        salaryRangeMin: "50000",
        salaryRangeMax: "60000",
        currency: "SEK",
        salaryPeriod: "annually",
      }),
    ).toBe("SEK 50,000 – 60,000 /yr");
  });

  it("formats a min-only bound as an open range", () => {
    expect(
      formatSalary({
        salaryRangeMin: "50000",
        currency: "NOK",
        salaryPeriod: "monthly",
      }),
    ).toBe("NOK 50,000+ /mo");
  });

  it("formats a max-only bound as an upper cap", () => {
    expect(
      formatSalary({
        salaryRangeMax: "60000",
        currency: "DKK",
        salaryPeriod: "monthly",
      }),
    ).toBe("Up to DKK 60,000 /mo");
  });
});
