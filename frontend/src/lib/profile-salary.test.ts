import { describe, expect, it } from "vitest";

import { formatProfileSalary } from "./profile-salary";

describe("formatProfileSalary", () => {
  it("writes the symbol, the amount in the language's digits and the period", () => {
    expect(
      formatProfileSalary(
        {
          current_salary: 58000,
          salary_currency: "EUR",
          salary_period: "annually",
        },
        "en-US",
      ),
    ).toBe("€58,000 / annually");
    expect(
      formatProfileSalary(
        {
          current_salary: 58000,
          salary_currency: "EUR",
          salary_period: "annually",
        },
        "pt-BR",
      ),
    ).toMatch(/^€58\.000 \/ /);
  });

  it("drops a missing period and says nothing without a salary", () => {
    expect(
      formatProfileSalary(
        { current_salary: 900, salary_currency: "BRL" },
        "en-US",
      ),
    ).toBe("R$900");
    expect(formatProfileSalary({ salary_currency: "BRL" }, "en-US")).toBeNull();
  });
});
