import { describe, expect, it } from "vitest";

import { REPORT_PHASE, effectiveReportStatus } from "./reports";

describe("effectiveReportStatus", () => {
  it("reads an overdue report as pending within 14 days of its day", () => {
    expect(effectiveReportStatus({ day: 28, status: "overdue" }, 29)).toBe(
      "pending",
    );
    expect(effectiveReportStatus({ day: 28, status: "overdue" }, 42)).toBe(
      "pending",
    );
    expect(effectiveReportStatus({ day: 28, status: "overdue" }, 43)).toBe(
      "overdue",
    );
  });

  it("leaves every other status as the API sent it", () => {
    for (const status of ["submitted", "pending", "future"] as const) {
      expect(effectiveReportStatus({ day: 14, status }, 60)).toBe(status);
    }
  });
});

describe("REPORT_PHASE", () => {
  it("maps each report day to its phase", () => {
    expect(Object.entries(REPORT_PHASE)).toEqual([
      ["1", 1],
      ["14", 1],
      ["28", 1],
      ["42", 2],
      ["56", 2],
      ["70", 3],
      ["84", 3],
      ["98", 4],
      ["112", 4],
      ["120", 4],
    ]);
  });
});
