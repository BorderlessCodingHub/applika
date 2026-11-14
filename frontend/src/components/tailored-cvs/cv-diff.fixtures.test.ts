import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { diffCv, sortCvDiffChanges, type CvDiffSnapshot } from "./cv-diff";

/**
 * Fixture-driven parity between the web's `diffCv()` and the server's own
 * diff: both load every file in `applika/backend/tests/fixtures/cv-diff/*.json`
 * — `{"name", "baseline", "current", "expected"}` — and assert their canonical
 * output equals `expected`.
 *
 * The backend owns the folder and the fixtures; its own suite reads them from
 * the same place. A missing or empty folder FAILS this suite, naming the path
 * it looked in — it never skips itself, so a moved folder cannot silently turn
 * the parity check off.
 */
const FIXTURES_DIR = resolve(
  __dirname,
  "../../../../backend/tests/fixtures/cv-diff",
);

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

describe("diffCv matches the server's fixtures", () => {
  // Read only when the folder is there, so a missing one fails the test below
  // instead of throwing while the suite is collected.
  const files = hasFixtures
    ? readdirSync(FIXTURES_DIR).filter((file) => file.endsWith(".json"))
    : [];

  it("finds the fixture folder and at least one fixture file", () => {
    expect(
      hasFixtures,
      `CV diff fixtures folder not found: ${FIXTURES_DIR}`,
    ).toBe(true);
    expect(
      files.length,
      `no *.json fixture in ${FIXTURES_DIR}`,
    ).toBeGreaterThan(0);
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
