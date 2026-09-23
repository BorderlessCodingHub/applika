import { describe, expect, it } from "vitest";

import { buildConversionRows } from "./step-conversion-chart";
import { buildAvgDaysRows } from "./avg-days-per-step-chart";
import {
  TIMELINE_STAGES,
  stageLabel,
  stageShortLabel,
} from "@/components/timeline/timeline-options";
import type { StepAvgDays, StepConversion } from "@/services/types/statistics";

/**
 * PRD 0008 / ADR 0012, AC5: "both charts render the 9 stage rows, labelled
 * from timeline-options". `ResponsiveContainer` reports zero size in jsdom
 * (recharts never renders bars/ticks there), so this pins the row-building
 * logic each chart feeds to recharts instead of asserting on painted SVG.
 */

describe("StepConversionChart row building", () => {
  it("always renders exactly the 9 TIMELINE_STAGES, in order", () => {
    const rows = buildConversionRows(undefined);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.shortLabel)).toEqual(
      TIMELINE_STAGES.map((s) => stageShortLabel(s.eventType, s.interviewType)),
    );
    expect(rows.map((r) => r.fullLabel)).toEqual(
      TIMELINE_STAGES.map((s) => stageLabel(s.eventType, s.interviewType)),
    );
  });

  it("fills a stage the API omitted with 0, not a missing bar", () => {
    const apiRows: StepConversion[] = [
      {
        event_type: "offer",
        interview_type: null,
        conversion_rate: 12,
        total_applications: 3,
      },
    ];
    const rows = buildConversionRows(apiRows);
    expect(rows).toHaveLength(9);
    const offerRow = rows.find((r) => r.fullLabel === "Offer");
    expect(offerRow).toMatchObject({
      conversion_rate: 12,
      total_applications: 3,
    });
    const untouched = rows.filter((r) => r.fullLabel !== "Offer");
    for (const row of untouched) {
      expect(row.conversion_rate).toBe(0);
      expect(row.total_applications).toBe(0);
    }
  });
});

describe("AvgDaysPerStepChart row building", () => {
  it("always renders exactly the 9 TIMELINE_STAGES, in order", () => {
    const rows = buildAvgDaysRows(undefined);
    expect(rows).toHaveLength(9);
    expect(rows.map((r) => r.shortLabel)).toEqual(
      TIMELINE_STAGES.map((s) => stageShortLabel(s.eventType, s.interviewType)),
    );
  });

  it("fills a stage the API omitted with 0 days", () => {
    const apiRows: StepAvgDays[] = [
      { event_type: "denied", interview_type: null, average_days: 4.5 },
    ];
    const rows = buildAvgDaysRows(apiRows);
    expect(rows).toHaveLength(9);
    const deniedRow = rows.find((r) => r.fullLabel === "Denied");
    expect(deniedRow?.average_days).toBe(4.5);
    const untouched = rows.filter((r) => r.fullLabel !== "Denied");
    for (const row of untouched) {
      expect(row.average_days).toBe(0);
    }
  });
});
