import { describe, expect, it } from "vitest";

import { computeDividerVisibility } from "@/components/applications/application-detail-tile";

/**
 * KODI-015 remediation round 2: `before:hidden!` unconditionally on BOTH
 * salary tiles (a prior fix for wrapping salary values) also hid the divider
 * a salary tile needs when it lands to the RIGHT of another tile in its row
 * — e.g. Platform/Source/Date/Work Mode fill the first 4-column row, Country
 * starts row 2, then Salary Range (span 2) sits right after it in the SAME
 * row and needs a divider; Expected Salary (span 2) then wraps to its own
 * row and must NOT show one. `computeDividerVisibility` is the pure packing
 * simulation `ApplicationItem` now uses per tile, per breakpoint, instead of
 * a blanket `before:hidden!` — asserted here on its return value (a boolean
 * array), never on rendered classes.
 */
describe("computeDividerVisibility", () => {
  it("shows no divider on the first tile of a row, at 4 columns", () => {
    // platform, source, date, experience — one full row of four 1-span tiles.
    expect(computeDividerVisibility([1, 1, 1, 1], 4)).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it("shows the divider on a 2-span tile that is NOT first in its row (the KODI-015 bug)", () => {
    // platform, source, date, workMode fill row 1; country starts row 2;
    // salaryRange (span 2) sits right after country in row 2 — needs a
    // divider; expectedSalary (span 2) no longer fits and wraps to row 3,
    // starting it — must not show one.
    expect(computeDividerVisibility([1, 1, 1, 1, 1, 2, 2], 4)).toEqual([
      false,
      true,
      true,
      true,
      false,
      true,
      false,
    ]);
  });

  it("never shows a divider on a tile spanning the full row (Notes)", () => {
    // A tile whose span reaches `columns` always starts and fills its own
    // row, at any column count, so it is always "first in row".
    expect(computeDividerVisibility([1, 1, 4], 4)).toEqual([
      false,
      true,
      false,
    ]);
    expect(computeDividerVisibility([1, 2], 2)).toEqual([false, false]);
  });

  it("shows a divider only on the second tile of a row, at 2 columns", () => {
    expect(computeDividerVisibility([1, 1, 1, 1], 2)).toEqual([
      false,
      true,
      false,
      true,
    ]);
  });

  it("shows no divider when the grid is a single column (mobile)", () => {
    // Every tile is first-in-row when only one tile fits per row.
    expect(computeDividerVisibility([1, 1, 2, 2], 1)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
});
