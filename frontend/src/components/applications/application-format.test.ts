import { describe, expect, it } from "vitest";

import { formatSalary } from "@/components/applications/application-format";

/**
 * AC22 (KODI-013 addendum) — owner: "ISO code everywhere (Recommended)".
 * Application rows show the ISO currency code (e.g. "SEK 50,000"), never a
 * symbol, exactly like the timeline cards (`timeline-format.ts`'s
 * `formatOfferSalary` already delegates to this same function). Pinned across
 * every currency the owner named plus the three salary shapes a row can show:
 * a single expected amount, a min–max range, and each one-sided bound.
 *
 * The amount's own grouping (`amount()`) is built with the SAME
 * `Intl.NumberFormat(undefined, …)` call `formatSalary` uses internally,
 * rather than a hardcoded "50,000" — so this test asserts the ISO-code
 * behaviour under test, not this machine's locale (frontend-qa nit).
 */
function amount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

describe("formatSalary (AC22 — ISO code, never a symbol)", () => {
  it.each(["SEK", "NOK", "DKK", "USD", "EUR"])(
    "prints the ISO code for %s, never a symbol",
    (currency) => {
      const result = formatSalary({
        expectedSalary: "50000",
        currency,
        salaryPeriod: null,
      });
      expect(result).toBe(`${currency} ${amount(50000)}`);
    },
  );

  it("formats a min–max range with one currency prefix and one period suffix", () => {
    expect(
      formatSalary({
        salaryRangeMin: "50000",
        salaryRangeMax: "60000",
        currency: "SEK",
        salaryPeriod: "annually",
      }),
    ).toBe(`SEK ${amount(50000)} – ${amount(60000)} /yr`);
  });

  it("formats a min-only bound as an open range", () => {
    expect(
      formatSalary({
        salaryRangeMin: "50000",
        currency: "NOK",
        salaryPeriod: "monthly",
      }),
    ).toBe(`NOK ${amount(50000)}+ /mo`);
  });

  it("formats a max-only bound as an upper cap", () => {
    expect(
      formatSalary({
        salaryRangeMax: "60000",
        currency: "DKK",
        salaryPeriod: "monthly",
      }),
    ).toBe(`Up to DKK ${amount(60000)} /mo`);
  });
});
