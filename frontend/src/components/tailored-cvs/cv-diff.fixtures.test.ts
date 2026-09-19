import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { diffCv, sortCvDiffChanges, type CvDiffSnapshot } from "./cv-diff";

/**
 * Fixture-driven parity between the web's `diffCv()` and the server's own
 * diff (KODI-017 part 3, PINNED): both load every file in
 * `applika/fixtures/cv-diff/*.json` — `{"name", "baseline", "current",
 * "expected"}` — and assert their canonical output equals `expected`.
 *
 * The backend owns creating the folder and the fixtures (T091). This suite
 * SKIPS itself, rather than failing, while the folder does not exist yet —
 * `cv-diff.test.ts` carries the same pinned cases as hand-written unit tests
 * in the meantime. Once the folder appears, this file activates with no
 * further change needed.
 */
const FIXTURES_DIR = resolve(__dirname, "../../../../fixtures/cv-diff");

interface CvDiffFixture {
  name: string;
  baseline: CvDiffSnapshot;
  current: CvDiffSnapshot;
  expected: {
    total: number;
    sections: Record<string, number>;
    changes: unknown[];
  };
}

const hasFixtures = existsSync(FIXTURES_DIR);

describe.skipIf(!hasFixtures)("diffCv matches the server's fixtures", () => {
  const files = hasFixtures
    ? readdirSync(FIXTURES_DIR).filter((file) => file.endsWith(".json"))
    : [];

  it("found at least one fixture file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`matches ${file}`, () => {
      const fixture = JSON.parse(
        readFileSync(resolve(FIXTURES_DIR, file), "utf-8"),
      ) as CvDiffFixture;

      // The fixture's `current` is the SAVED-copy shape (`CvDiffSnapshot`,
      // `phone: string | null`), which is a subset of the wider form shape
      // `diffCv` accepts (`phone: string`) — `eq()` treats `null` and `""` as
      // the same absence either way, so the cast changes nothing it compares.
      const result = diffCv(
        fixture.baseline,
        fixture.current as unknown as Parameters<typeof diffCv>[1],
      );

      expect(result.total).toBe(fixture.expected.total);
      expect(result.sections).toEqual(fixture.expected.sections);
      expect(sortCvDiffChanges(result.changes)).toEqual(
        sortCvDiffChanges(fixture.expected.changes as never[]),
      );
    });
  }
});
