import { describe, expect, it } from "vitest";

import { UserProfileSchema } from "@/components/profile/edit-form-config";
import { SALARY_CURRENCIES } from "@/components/timeline/timeline-types";
import { SelectOptions } from "@/options";
import {
  SalaryCurrencyValues,
  SalaryPeriodValues,
} from "@/services/types/users";

/**
 * AC9 (R-031), the profile and application-form share: every currency list is
 * the same 20 and every period list is `hourly | monthly | annually`. The
 * profile edit form and the application create/edit form read
 * `SelectOptions` for their options and `SalaryCurrencyValues` /
 * `SalaryPeriodValues` for their zod enums, so pinning those pins both forms.
 */

const TWENTY = [
  "USD",
  "BRL",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "INR",
  "CNY",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "SGD",
  "HKD",
  "NZD",
  "MXN",
  "ZAR",
  "AED",
];

describe("AC9 — one currency and period list across the app", () => {
  it("the zod enum sources are the shared timeline lists", () => {
    expect(SalaryCurrencyValues).toBe(SALARY_CURRENCIES);
    expect([...SalaryCurrencyValues]).toEqual(TWENTY);
    expect([...SalaryPeriodValues]).toEqual(["hourly", "monthly", "annually"]);
  });

  it("the select options list the 20 currencies, each with a symbol", () => {
    expect(SelectOptions.CURRENCY.map((c) => c.value)).toEqual(TWENTY);
    for (const c of SelectOptions.CURRENCY) expect(c.symbol).toBeTruthy();
  });

  it("the period options are hourly, monthly, annually — never annual", () => {
    expect(SelectOptions.SALARY_PERIOD.map((p) => p.value)).toEqual([
      "hourly",
      "monthly",
      "annually",
    ]);
  });

  it("the profile schema accepts annually and SEK and rejects annual", () => {
    const shape = UserProfileSchema.shape;
    expect(shape.salary_period.safeParse("annually").success).toBe(true);
    expect(shape.salary_period.safeParse("annual").success).toBe(false);
    expect(shape.salary_currency.safeParse("SEK").success).toBe(true);
  });
});
