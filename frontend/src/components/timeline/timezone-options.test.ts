import { describe, expect, it } from "vitest";

import {
  browserTimeZone,
  FALLBACK_TIME_ZONE,
  groupTimeZones,
  supportedTimeZones,
  timeZoneFilter,
  timeZoneLabel,
  timeZoneOffset,
} from "@/components/timeline/timezone-options";

/**
 * PRD 0008 / ADR 0012, KODI-014 (AC3): the timezone picker is a searchable
 * combobox over `Intl.supportedValuesOf("timeZone")`, `UTC` always offered,
 * grouped by region, with a stored-but-unlisted value shown first in its own
 * "Selected" group.
 */

describe("supportedTimeZones", () => {
  it("always offers UTC", () => {
    expect(supportedTimeZones()).toContain(FALLBACK_TIME_ZONE);
  });

  it("returns a non-empty list of real IANA ids", () => {
    const zones = supportedTimeZones();
    expect(zones.length).toBeGreaterThan(1);
    expect(zones).toContain("Europe/London");
  });
});

describe("browserTimeZone", () => {
  it("returns a non-empty string", () => {
    expect(browserTimeZone()).toBeTruthy();
  });

  it("matches Intl.DateTimeFormat().resolvedOptions().timeZone", () => {
    expect(browserTimeZone()).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
});

describe("timeZoneLabel", () => {
  it("replaces underscores with spaces", () => {
    expect(timeZoneLabel("America/Sao_Paulo")).toBe("America/Sao Paulo");
  });

  it("leaves a zone with no underscore untouched", () => {
    expect(timeZoneLabel("Europe/London")).toBe("Europe/London");
  });
});

describe("timeZoneOffset", () => {
  it("returns GMT for UTC", () => {
    expect(timeZoneOffset("UTC")).toBe("GMT");
  });

  it("returns null for an id the engine does not know", () => {
    expect(timeZoneOffset("Not/A_Real_Zone")).toBeNull();
  });
});

describe("groupTimeZones", () => {
  it("groups by region, Other last, with UTC among the region-less zones", () => {
    const groups = groupTimeZones("");
    expect(groups.length).toBeGreaterThan(1);
    const last = groups[groups.length - 1];
    expect(last.heading).toBe("Other");
    expect(last.options.some((option) => option.value === "UTC")).toBe(true);
    // Every zone value in a non-"Other" group carries a "/".
    for (const group of groups.slice(0, -1)) {
      for (const option of group.options) {
        expect(option.value).toContain("/");
      }
    }
  });

  it("puts a stored value already in the list in its normal region group only", () => {
    const groups = groupTimeZones("Europe/London");
    const europe = groups.find((group) => group.heading === "Europe");
    expect(europe?.options.some((o) => o.value === "Europe/London")).toBe(true);
    expect(groups[0].heading).not.toBe("Selected");
  });

  it("puts a stored value NOT in the list first, in its own Selected group, and still shows it", () => {
    const groups = groupTimeZones("Legacy/Not_A_Real_Zone");
    expect(groups[0].heading).toBe("Selected");
    expect(groups[0].options).toHaveLength(1);
    expect(groups[0].options[0]).toMatchObject({
      value: "Legacy/Not_A_Real_Zone",
      label: "Legacy/Not A Real Zone",
    });
    // Not duplicated anywhere else in the list.
    const elsewhere = groups
      .slice(1)
      .flatMap((group) => group.options)
      .some((option) => option.value === "Legacy/Not_A_Real_Zone");
    expect(elsewhere).toBe(false);
  });

  it("adds no Selected group for a blank value", () => {
    const groups = groupTimeZones("");
    expect(groups.some((group) => group.heading === "Selected")).toBe(false);
  });
});

describe("timeZoneFilter", () => {
  it("matches a case-insensitive substring of the zone id", () => {
    expect(timeZoneFilter("Europe/London", "london")).toBeGreaterThan(0);
    expect(timeZoneFilter("Europe/London", "LONDON")).toBeGreaterThan(0);
  });

  it("does not fuzzy-match unrelated letters", () => {
    // cmdk's default scorer would fuzzy-match "zzzz" into "Brazzaville"; the
    // substring filter must not.
    expect(timeZoneFilter("Africa/Brazzaville", "zzzz")).toBe(0);
  });

  it("matches UTC offsets normalized to GMT (UTC-3 finds GMT-3)", () => {
    expect(
      timeZoneFilter("America/Sao_Paulo", "utc-3", ["GMT-3"]),
    ).toBeGreaterThan(0);
  });

  it("ranks a match at a word start higher than a mid-word match", () => {
    const wordStart = timeZoneFilter("Europe/London", "london");
    const midWord = timeZoneFilter("Europe/London", "ond");
    expect(wordStart).toBeGreaterThan(midWord);
  });

  it("matches everything on an empty query", () => {
    expect(timeZoneFilter("Europe/London", "")).toBe(1);
  });
});
