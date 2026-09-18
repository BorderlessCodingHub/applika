import { Users } from "lucide-react";
import { describe, expect, it } from "vitest";

import { EVENT_TYPE_CONFIG } from "@/components/timeline/timeline-options";

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
