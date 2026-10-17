import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins T040: the 16 files of `src/components/timeline/`. Per the owner's
 * KODI-011 lesson ("port a named source WHOLE, never a prose subset" —
 * feature 0007's "40% deviation"), this test hard-codes each file's export
 * surface (captured 2026-09-18 via `grep -nE "^export "`) and asserts every
 * one of those names still appears in the file. The expectations below are
 * the pin, not a live diff.
 *
 * A name is matched as a whole word in the applika source text rather than by
 * importing the module: several pinned exports are `export type` /
 * `export interface`, which TypeScript erases at runtime, so a namespace
 * import would under-report. Text matching also works uniformly for the two
 * test files (T040 ports 16 FILES, and `timeline-event-schema.test.ts` is one
 * of them, even though a test file exports nothing importable).
 */

const TIMELINE_DIR = path.resolve(__dirname);

/** file -> the file's pinned exported symbol names (types included). */
const PORTED_FILES: Record<string, string[]> = {
  "event-type-badge.tsx": ["EventTypeBadge"],
  "event-type-selector.tsx": ["EventTypeSelector"],
  "index.ts": [
    "EventTypeBadge",
    "EventTypeSelector",
    "SalaryPeriodToggle",
    "TimelineEventCard",
    "TimelineEventList",
    "TimelinePanel",
    "TimelineEventDialog",
    "TimelineEventFormFields",
    "TimelineEventFormFieldsProps",
    "formatEventDate",
    "formatOfferSalary",
    "formatTimeRange",
    "EVENT_TYPE_CONFIG",
    "EVENT_TYPE_OPTIONS",
    "OFFER_SALARY_PERIOD_OPTIONS",
    "EventTypeConfig",
    "TIMELINE_EVENT_TYPES",
    "OfferSalaryPeriod",
    "TimelineEventType",
    "TimelineEventView",
  ],
  "salary-period-toggle.tsx": ["SalaryPeriodToggle"],
  "timeline-event-card.tsx": ["TimelineEventCard"],
  "timeline-event-dialog.tsx": ["TimelineEventDialog"],
  "timeline-event-form-fields.tsx": [
    "TimelineEventFormFieldsProps",
    "TimelineEventFormFields",
  ],
  "timeline-event-form.tsx": ["TimelineEventForm"],
  "timeline-event-list.tsx": ["TimelineEventList"],
  "timeline-event-schema.ts": [
    "timelineEventSchema",
    "TimelineEventFormValues",
    "emptyTimelineEventValues",
    "timelineEventToFormValues",
    "toTimelineEventPayload",
  ],
  "timeline-event-schema.test.ts": [],
  "timeline-format.ts": [
    "formatEventDate",
    "formatTimeRange",
    "formatOfferSalary",
  ],
  "timeline-options.ts": [
    "EventTypeConfig",
    "EVENT_TYPE_CONFIG",
    "EVENT_TYPE_OPTIONS",
    "OFFER_SALARY_PERIOD_OPTIONS",
  ],
  "timeline-panel.tsx": ["TimelinePanel"],
  "timeline-section.tsx": ["TimelineSection"],
  "timeline-types.ts": [
    "TIMELINE_EVENT_TYPES",
    "TimelineEventType",
    "OfferSalaryPeriod",
    "TimelineEventView",
  ],
};

describe("components/timeline/ exports (T040)", () => {
  it("ports exactly the 16 named files", () => {
    expect(Object.keys(PORTED_FILES)).toHaveLength(16);
  });

  for (const [file, exportNames] of Object.entries(PORTED_FILES)) {
    it(`${file} exists in applika`, () => {
      expect(existsSync(path.join(TIMELINE_DIR, file))).toBe(true);
    });

    if (exportNames.length > 0) {
      it(`${file} still carries every pinned export`, () => {
        const source = readFileSync(path.join(TIMELINE_DIR, file), "utf8");
        for (const name of exportNames) {
          expect(source, `${file} is missing "${name}"`).toMatch(
            new RegExp(`\\b${name}\\b`),
          );
        }
      });
    }
  }
});
