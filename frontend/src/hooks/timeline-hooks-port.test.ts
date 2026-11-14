import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pins T039: the timeline/finalize/reopen hooks
 * (`use-timeline`, `use-create/update/delete-timeline-event`,
 * `use-finalize-application`, `use-reopen-application`, plus
 * `use-timeline.test.tsx`). Same approach as
 * `src/components/timeline/timeline-port.test.ts`: the export list is
 * hard-coded (captured 2026-09-18) and matched as text against each file.
 */

const HOOKS_DIR = path.resolve(__dirname);

const PORTED_FILES: Record<string, string[]> = {
  "use-timeline.ts": ["TIMELINE_QUERY_KEY", "useTimeline"],
  "use-create-timeline-event.ts": ["useCreateTimelineEvent"],
  "use-update-timeline-event.ts": ["useUpdateTimelineEvent"],
  "use-delete-timeline-event.ts": ["useDeleteTimelineEvent"],
  // use-finalize-application.ts / use-reopen-application.ts carry the R-032
  // outcome payload (owner decision
  // 2026-09-18, superseding the plan's finalize line) but keep the same
  // exported hook name.
  "use-finalize-application.ts": ["useFinalizeApplication"],
  "use-reopen-application.ts": ["useReopenApplication"],
  "use-timeline.test.tsx": [],
};

describe("timeline hooks exports (T039)", () => {
  it("ports exactly the 6 hooks + their test file", () => {
    expect(Object.keys(PORTED_FILES)).toHaveLength(7);
  });

  for (const [file, exportNames] of Object.entries(PORTED_FILES)) {
    it(`${file} exists in applika`, () => {
      expect(existsSync(path.join(HOOKS_DIR, file))).toBe(true);
    });

    if (exportNames.length > 0) {
      it(`${file} still carries every pinned export`, () => {
        const source = readFileSync(path.join(HOOKS_DIR, file), "utf8");
        for (const name of exportNames) {
          expect(source, `${file} is missing "${name}"`).toMatch(
            new RegExp(`\\b${name}\\b`),
          );
        }
      });
    }
  }

  it("deletes use-application-steps.ts (step/feedback definitions are gone)", () => {
    expect(existsSync(path.join(HOOKS_DIR, "use-application-steps.ts"))).toBe(
      false,
    );
  });
});
