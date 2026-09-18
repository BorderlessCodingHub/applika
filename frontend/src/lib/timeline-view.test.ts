import { describe, expect, it } from "vitest";

import { toTimelineEventView } from "./timeline-view";
import type { TimelineEvent } from "@/services/types/timeline";

const BASE: TimelineEvent = {
  id: "1",
  application_id: "a",
  user_id: "u",
  event_type: "interview",
  interview_type: "technical",
  event_date: "2026-07-02",
  start_time: "09:00:00",
  end_time: "10:30:00",
  timezone: "Europe/London",
  observation: null,
  salary_period: null,
  salary_amount: null,
  salary_currency: null,
  created_at: "2026-07-02T12:00:00Z",
  updated_at: null,
};

describe("toTimelineEventView (AC1)", () => {
  it("trims the API's HH:MM:SS times to HH:mm", () => {
    const view = toTimelineEventView(BASE);
    expect(view.startTime).toBe("09:00");
    expect(view.endTime).toBe("10:30");
  });

  it("keeps a missing time null", () => {
    const view = toTimelineEventView({
      ...BASE,
      start_time: null,
      end_time: null,
    });
    expect(view.startTime).toBeNull();
    expect(view.endTime).toBeNull();
  });
});
