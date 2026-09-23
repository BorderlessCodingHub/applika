import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins T038: the whole port of mynextjob's timeline service layer
 * (`types/timeline.ts`, `interfaces/i-timeline-service.ts`,
 * `implementations/timeline-service.ts`). Same approach as the sibling port
 * tests: the export list is hard-coded from mynextjob (captured 2026-09-18),
 * matched as text against the applika file — mynextjob is not read at test
 * time.
 *
 * `types/timeline.ts` additionally carries `interview_type` (applika-only —
 * mynextjob has no interview types) as an optional field of
 * `NonOfferTimelineEventPayload`; the exported symbol NAMES below are
 * otherwise identical to mynextjob's.
 */

const SERVICES_DIR = path.resolve(__dirname);

const PORTED_FILES: Record<string, string[]> = {
  "types/timeline.ts": [
    "TimelineEvent",
    "NonOfferTimelineEventPayload",
    "OfferTimelineEventPayload",
    "CreateTimelineEventPayload",
    "UpdateTimelineEventPayload",
  ],
  "interfaces/i-timeline-service.ts": ["ITimelineService"],
  "implementations/timeline-service.ts": ["TimelineService"],
};

describe("mynextjob timeline service layer port (T038)", () => {
  it("ports exactly the 3 named files", () => {
    expect(Object.keys(PORTED_FILES)).toHaveLength(3);
  });

  for (const [file, exportNames] of Object.entries(PORTED_FILES)) {
    it(`${file} exists in applika`, () => {
      expect(existsSync(path.join(SERVICES_DIR, file))).toBe(true);
    });

    it(`${file} still carries every mynextjob export`, () => {
      const source = readFileSync(path.join(SERVICES_DIR, file), "utf8");
      for (const name of exportNames) {
        expect(source, `${file} is missing "${name}"`).toMatch(
          new RegExp(`\\b${name}\\b`),
        );
      }
    });
  }

  it("wires the timeline service into the container", () => {
    const source = readFileSync(path.join(SERVICES_DIR, "services.ts"), "utf8");
    expect(source).toMatch(/timeline\s*=\s*new TimelineService\(\)/);
  });
});
