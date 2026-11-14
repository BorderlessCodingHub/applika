import { describe, expect, it } from "vitest";

import {
  funnel,
  insightsSummary,
  modeSplit,
  stepDays,
  weekly,
} from "./insights";
import type {
  GeneralStats,
  StepAvgDays,
  StepConversion,
} from "@/services/types/statistics";

const GENERAL: GeneralStats = {
  total_applications: 34,
  success_rate: 5.9,
  offers: 2,
  denials: 9,
  active: 12,
};

function conversion(rows: Partial<Record<string, number>>): StepConversion[] {
  const row = (
    event_type: StepConversion["event_type"],
    interview_type: StepConversion["interview_type"],
    key: string,
  ): StepConversion => ({
    event_type,
    interview_type,
    conversion_rate: 0,
    total_applications: rows[key] ?? 0,
  });
  return [
    row("interview", "unknown", "unknown"),
    row("interview", "initial_screening", "screening"),
    row("interview", "technical", "technical"),
    row("interview", "final", "final"),
    row("offer", null, "offer"),
    row("denied", null, "denied"),
  ];
}

function avg(rows: Partial<Record<string, number>>): StepAvgDays[] {
  return [
    {
      event_type: "interview",
      interview_type: "initial_screening",
      average_days: rows.screening ?? 0,
    },
    {
      event_type: "interview",
      interview_type: "technical",
      average_days: rows.technical ?? 0,
    },
    {
      event_type: "offer",
      interview_type: null,
      average_days: rows.offer ?? 0,
    },
  ];
}

describe("insightsSummary", () => {
  it("passes the API's numbers through", () => {
    expect(insightsSummary(GENERAL)).toEqual({
      successRate: 5.9,
      offers: 2,
      applications: 34,
      active: 12,
    });
  });
});

describe("funnel", () => {
  it("counts Applied from the total and the rest from their conversion rows, as whole percents", () => {
    expect(
      funnel(GENERAL, conversion({ screening: 17, technical: 9, offer: 2 })),
    ).toEqual([
      { stage: "applied", count: 34, percent: 100 },
      { stage: "screening", count: 17, percent: 50 },
      { stage: "technical", count: 9, percent: 26 },
      { stage: "offer", count: 2, percent: 6 },
    ]);
  });

  it("reads 0% everywhere with no application", () => {
    expect(
      funnel({ ...GENERAL, total_applications: 0 }, conversion({})).map(
        (row) => row.percent,
      ),
    ).toEqual([0, 0, 0, 0]);
  });

  it("reads 0 for a stage the API left out", () => {
    expect(funnel(GENERAL, [])[1]).toEqual({
      stage: "screening",
      count: 0,
      percent: 0,
    });
  });
});

describe("weekly", () => {
  // Wednesday, 11 November 2026: its ISO week starts Monday the 9th.
  const TODAY = new Date(2026, 10, 11, 9, 0);

  it("returns eight ISO weeks, Monday first, ending with this week, oldest first", () => {
    const weeks = weekly([], TODAY);
    expect(weeks).toHaveLength(8);
    expect(weeks.every((week) => week.weekStart.getDay() === 1)).toBe(true);
    expect(weeks[7].weekStart).toEqual(new Date(2026, 10, 9));
    expect(weeks[0].weekStart).toEqual(new Date(2026, 8, 21));
    expect(weeks.map((week) => week.count)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("counts by the application date's week, empty weeks 0, older ones dropped", () => {
    const weeks = weekly(
      [
        "2026-11-09", // Monday: this week
        "2026-11-11",
        "2026-11-08", // Sunday: last week
        "2026-11-02", // Monday: last week
        "2026-09-21", // the first week shown
        "2026-09-20", // a Sunday: the week before, not shown
        "2026-12-01", // a later week: not shown
      ],
      TODAY,
    );
    expect(weeks.map((week) => week.count)).toEqual([1, 0, 0, 0, 0, 0, 2, 2]);
  });

  it("ends with the week holding the date it is given (an archived cycle's last application)", () => {
    const weeks = weekly(["2025-03-05"], new Date(2025, 2, 5));
    expect(weeks[7]).toEqual({ weekStart: new Date(2025, 2, 3), count: 1 });
  });
});

describe("stepDays", () => {
  it("reads the days to Screening, then the gaps between consecutive averages", () => {
    expect(
      stepDays(
        conversion({ screening: 10, technical: 5, offer: 2 }),
        avg({ screening: 6.4, technical: 15.2, offer: 30 }),
      ),
    ).toEqual([
      { key: "appliedToScreening", days: 6 },
      { key: "screeningToTechnical", days: 9 },
      { key: "technicalToOffer", days: 15 },
    ]);
  });

  it("never goes below zero", () => {
    expect(
      stepDays(
        conversion({ screening: 10, technical: 5, offer: 2 }),
        avg({ screening: 12, technical: 8, offer: 3 }),
      ).map((row) => row.days),
    ).toEqual([12, 0, 0]);
  });

  it("shows a dash when either stage of a row has no data", () => {
    expect(
      stepDays(
        conversion({ screening: 10, technical: 0, offer: 2 }),
        avg({ screening: 5, offer: 20 }),
      ).map((row) => row.days),
    ).toEqual([5, null, null]);
    expect(stepDays(conversion({}), avg({})).map((row) => row.days)).toEqual([
      null,
      null,
      null,
    ]);
  });
});

describe("modeSplit", () => {
  it("keeps active and passive", () => {
    expect(modeSplit({ active: 28, passive: 6 })).toEqual({
      active: 28,
      passive: 6,
    });
  });
});
