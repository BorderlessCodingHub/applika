import { describe, expect, it } from "vitest";

import { applicationHistory } from "./application-history";
import type { TimelineEvent } from "@/services/types/timeline";

function event(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: "e1",
    application_id: "a1",
    user_id: "u1",
    event_type: "interview",
    interview_type: "technical",
    denied_reason: null,
    event_date: "2026-11-09",
    observation: null,
    salary_period: null,
    salary_amount: null,
    salary_currency: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

// Monday 9 November 2026, 11:45 UTC.
const NOW = new Date(Date.UTC(2026, 10, 9, 11, 45));

describe("applicationHistory", () => {
  it("marks a future event scheduled, a past interview with a later event passed, any other past event done", () => {
    const { history, next } = applicationHistory(
      [
        event({
          id: "screen",
          interview_type: "initial_screening",
          event_date: "2026-10-21",
          start_time: "10:30:00",
          timezone: "UTC",
        }),
        event({
          id: "tech",
          event_date: "2026-11-09",
          start_time: "14:00:00",
          end_time: "15:00:00",
          timezone: "UTC",
        }),
        event({
          id: "cultural",
          interview_type: "cultural",
          event_date: "2026-10-01",
        }),
      ],
      NOW,
      "UTC",
    );

    expect(history.map((entry) => [entry.event.id, entry.status])).toEqual([
      ["tech", "scheduled"],
      ["screen", "passed"],
      ["cultural", "passed"],
    ]);
    expect(next).toMatchObject({ day: "2026-11-09", daysAway: 0 });
    expect(next?.event.id).toBe("tech");
  });

  it("calls the latest past event done, and a recorded outcome done on its day", () => {
    const { history, next } = applicationHistory(
      [
        event({
          id: "screen",
          interview_type: "initial_screening",
          event_date: "2026-10-21",
        }),
        event({
          id: "denied",
          event_type: "denied",
          interview_type: null,
          event_date: "2026-11-09",
        }),
      ],
      NOW,
      "UTC",
    );
    expect(history.map((entry) => [entry.event.id, entry.status])).toEqual([
      ["denied", "done"],
      ["screen", "passed"],
    ]);
    expect(next).toBeNull();
  });

  it("keeps an untimed interview scheduled until its day is over, with its days away", () => {
    const { next, history } = applicationHistory(
      [
        event({
          id: "final",
          interview_type: "final",
          event_date: "2026-11-11",
        }),
      ],
      NOW,
      "UTC",
    );
    expect(next).toMatchObject({ daysAway: 2, day: "2026-11-11" });
    expect(history[0].status).toBe("scheduled");
  });

  it("reads the day in the viewer's zone", () => {
    const tokyo = event({
      id: "tokyo",
      event_date: "2026-11-10",
      start_time: "08:00:00",
      timezone: "Asia/Tokyo",
    });
    expect(applicationHistory([tokyo], NOW, "UTC").next).toMatchObject({
      day: "2026-11-09",
      daysAway: 0,
    });
    expect(applicationHistory([tokyo], NOW, "Asia/Tokyo").next).toMatchObject({
      day: "2026-11-10",
      daysAway: 1,
    });
  });

  it("is empty with no event", () => {
    expect(applicationHistory([], NOW, "UTC")).toEqual({
      next: null,
      history: [],
    });
  });
});
