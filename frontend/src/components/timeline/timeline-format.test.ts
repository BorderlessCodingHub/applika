import { describe, expect, it } from "vitest";

import { formatTimeRange } from "@/components/timeline/timeline-format";

/**
 * PRD 0008 / ADR 0012, KODI-016 (AC2): the timeline formatters reuse
 * `timeZoneLabel` — the exact formatter `TimezoneSelect` shows — so a card's
 * time range reads the zone the same way the select does (underscores as
 * spaces), never the raw IANA id, and never a second implementation of the
 * same substitution.
 */
describe("formatTimeRange — readable zone (AC2, KODI-016)", () => {
  it("renders the zone with underscores replaced by spaces, exactly like the timezone select", () => {
    expect(formatTimeRange("10:00", "11:00", "America/Sao_Paulo")).toBe(
      "10:00–11:00 · America/Sao Paulo",
    );
  });

  it("renders a multi-underscore zone fully readable", () => {
    expect(
      formatTimeRange("09:00", "10:00", "America/Argentina/Buenos_Aires"),
    ).toBe("09:00–10:00 · America/Argentina/Buenos Aires");
  });

  it("returns null when there is no start time, whether the keys are null or entirely absent (KODI-016)", () => {
    expect(formatTimeRange(null, null, null)).toBeNull();
    expect(formatTimeRange(undefined, undefined, undefined)).toBeNull();
  });

  it("omits the zone segment when only the time range is present", () => {
    expect(formatTimeRange("10:00", "11:00", null)).toBe("10:00–11:00");
    expect(formatTimeRange("10:00", "11:00", undefined)).toBe("10:00–11:00");
  });
});
