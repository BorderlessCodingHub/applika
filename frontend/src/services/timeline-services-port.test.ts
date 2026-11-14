import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins T038: the timeline service layer
 * (`types/timeline.ts`, `interfaces/i-timeline-service.ts`,
 * `implementations/timeline-service.ts`). Same approach as the sibling port
 * tests: the export list is hard-coded (captured 2026-09-18) and matched as
 * text against each file.
 *
 * `types/timeline.ts` also carries `interview_type` as an optional field of
 * `NonOfferTimelineEventPayload`; it adds no exported symbol.
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

describe("timeline service layer exports (T038)", () => {
  it("ports exactly the 3 named files", () => {
    expect(Object.keys(PORTED_FILES)).toHaveLength(3);
  });

  for (const [file, exportNames] of Object.entries(PORTED_FILES)) {
    it(`${file} exists in applika`, () => {
      expect(existsSync(path.join(SERVICES_DIR, file))).toBe(true);
    });

    it(`${file} still carries every pinned export`, () => {
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
