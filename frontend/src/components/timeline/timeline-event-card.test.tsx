import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimelineEventCard } from "@/components/timeline/timeline-event-card";
import type { TimelineEventView } from "@/components/timeline/timeline-types";

/**
 * PRD 0008 / ADR 0012, KODI-016. AC1 (web part): a non-interview event never
 * shows a schedule, whether its wire keys are `null` or entirely absent. AC2:
 * the card shows the zone READABLE (underscores as spaces), exactly like the
 * timezone select.
 */
describe("TimelineEventCard — schedule (AC1/AC2, KODI-016)", () => {
  it("shows the readable zone for an interview event", () => {
    const event: TimelineEventView = {
      id: "1",
      type: "interview",
      interviewType: "technical",
      eventDate: "2026-07-02",
      startTime: "10:00",
      endTime: "11:00",
      timezone: "America/Sao_Paulo",
      observation: null,
    };
    render(<TimelineEventCard event={event} />);

    expect(screen.getByText(/America\/Sao Paulo/)).toBeInTheDocument();
    expect(screen.queryByText(/America\/Sao_Paulo/)).not.toBeInTheDocument();
  });

  it("shows no schedule for a non-interview event whose schedule keys are null", () => {
    const event: TimelineEventView = {
      id: "2",
      type: "note",
      eventDate: "2026-07-02",
      startTime: null,
      endTime: null,
      timezone: null,
      observation: "Just a note",
    };
    render(<TimelineEventCard event={event} />);

    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
    expect(screen.getByText("Just a note")).toBeInTheDocument();
  });

  it("renders without crashing, and shows no schedule, when a non-interview event's schedule keys are entirely absent (KODI-016)", () => {
    const event = {
      id: "3",
      type: "feedback",
      eventDate: "2026-07-02",
      observation: "Recruiter call",
      // start_time/end_time/timezone deliberately OMITTED — the API sends no
      // such keys for a non-interview event.
    } as TimelineEventView;

    render(<TimelineEventCard event={event} />);

    expect(screen.getByText("Recruiter call")).toBeInTheDocument();
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });
});
