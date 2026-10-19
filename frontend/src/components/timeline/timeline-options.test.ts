import { CircleDashed, Users } from "lucide-react";
import { describe, expect, it } from "vitest";

import { FINALIZE_OUTCOME_COPY } from "@/components/applications/application-close-copy";
import {
  CLOSE_TYPE_OPTIONS,
  EVENT_TYPE_CONFIG,
  EVENT_TYPE_OPTIONS,
  stageLabel,
} from "@/components/timeline/timeline-options";

/**
 * G9 (KODI-015 reference image): the interview event type uses the `Users`
 * icon everywhere it is drawn from `EVENT_TYPE_CONFIG` — the timeline event
 * card's tile, the read-only `EventTypeBadge`, and the Add-event dialog's
 * `EventTypeSelector` chip, which all read `config.icon` from this single
 * source rather than importing their own icon.
 */
describe("EVENT_TYPE_CONFIG.interview (G9)", () => {
  it("uses the Users icon", () => {
    expect(EVENT_TYPE_CONFIG.interview.icon).toBe(Users);
  });
});

/**
 * R-027: the shared stage label uses a spaced hyphen, not the old "·",
 * everywhere it is read from — the agenda pill, the header agenda dropdown,
 * agenda alerts, dashboard chart tooltips and timeline event action names.
 */
describe("stageLabel (R-027)", () => {
  it('joins an interview stage with " - "', () => {
    expect(stageLabel("interview", "initial_screening")).toBe(
      "Interview - Initial screening",
    );
  });

  it("a non-interview stage has no separator to change", () => {
    expect(stageLabel("offer")).toBe("Offer");
    expect(stageLabel("denied")).toBe("Denied");
  });
});

/**
 * The close dialog's chips: None (the old outcome picker's muted look and
 * words, ported whole), then Offer and Denied with their event look and the
 * old picker's line explaining what closing with each does.
 */
describe("CLOSE_TYPE_OPTIONS", () => {
  it("is None, Offer, Denied, never Interview", () => {
    expect(CLOSE_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "none",
      "offer",
      "denied",
    ]);
  });

  it("None keeps the old outcome picker's look and words", () => {
    expect(CLOSE_TYPE_OPTIONS[0]).toEqual({
      value: "none",
      label: "None",
      icon: CircleDashed,
      hint: FINALIZE_OUTCOME_COPY.none.description,
      tileClass: "bg-muted text-muted-foreground ring-border",
      selectedClass: "border-muted-foreground/40 bg-accent text-foreground",
    });
  });

  it.each(["offer", "denied"] as const)(
    "%s keeps its event look, with the closing explanation as its hint",
    (type) => {
      const option = CLOSE_TYPE_OPTIONS.find((o) => o.value === type)!;
      const config = EVENT_TYPE_CONFIG[type];
      expect(option.label).toBe(config.label);
      expect(option.icon).toBe(config.icon);
      expect(option.tileClass).toBe(config.tileClass);
      expect(option.selectedClass).toBe(config.selectedClass);
      expect(option.hint).toBe(FINALIZE_OUTCOME_COPY[type].description);
    },
  );

  it("leaves Add event's options and hints untouched", () => {
    expect(EVENT_TYPE_OPTIONS.map((option) => option.value)).toEqual([
      "interview",
      "offer",
      "denied",
    ]);
    expect(EVENT_TYPE_CONFIG.offer.hint).toBe(
      "An offer was extended — record the salary.",
    );
  });
});
