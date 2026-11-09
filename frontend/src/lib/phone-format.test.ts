import { describe, expect, it } from "vitest";

import {
  addDays,
  agendaDay,
  agendaTimeToStart,
  calendarDaysBetween,
  companyInitials,
  dayKey,
  dayPart,
  displayName,
  greeting,
  initials,
  mondayOf,
  nextInterview,
  parseDayKey,
  stagePillKey,
  stageTitleKey,
  timeToStart,
  upcomingAgenda,
} from "./phone-format";
import type { AgendaStep } from "@/services/types/applications";

describe("initials", () => {
  it("takes the first letters of the first and last name", () => {
    expect(
      initials({ username: "scarter", first_name: "Sam", last_name: "Carter" }),
    ).toBe("SC");
  });

  it("uppercases them", () => {
    expect(
      initials({ username: "x", first_name: "ada", last_name: "lovelace" }),
    ).toBe("AL");
  });

  it("falls back to the username without a first name", () => {
    expect(initials({ username: "octocat", last_name: "Cat" })).toBe("OC");
  });

  it("falls back to the username without a last name, as the desktop avatar", () => {
    expect(initials({ username: "octocat", first_name: "Ada" })).toBe("OC");
  });

  it("treats blank names as missing", () => {
    expect(
      initials({ username: "dev", first_name: "  ", last_name: " " }),
    ).toBe("DE");
  });

  it("keeps a one-letter username", () => {
    expect(initials({ username: "q" })).toBe("Q");
  });
});

describe("displayName", () => {
  it("joins the first and last name", () => {
    expect(
      displayName({
        username: "scarter",
        first_name: "Sam",
        last_name: "Carter",
      }),
    ).toBe("Sam Carter");
  });

  it("shows the first name alone when there is no last name", () => {
    expect(displayName({ username: "scarter", first_name: "Sam" })).toBe("Sam");
  });

  it("uses the username when there is no first name", () => {
    expect(displayName({ username: "octocat", last_name: "Cat" })).toBe(
      "octocat",
    );
  });

  it("trims the names", () => {
    expect(
      displayName({ username: "x", first_name: " Sam ", last_name: "  " }),
    ).toBe("Sam");
  });

  it("treats a blank first name as missing", () => {
    expect(displayName({ username: "octocat", first_name: "   " })).toBe(
      "octocat",
    );
  });
});

describe("greeting", () => {
  it.each([
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [23, "evening"],
    [0, "evening"],
    [4, "evening"],
  ] as const)("at %i:00 says good %s", (hour, part) => {
    expect(dayPart(new Date(2026, 10, 9, hour, 30))).toBe(part);
  });

  it("greets by the first name only", () => {
    expect(
      greeting(new Date(2026, 10, 9, 14), {
        username: "scarter",
        first_name: "Sam",
        last_name: "Carter",
      }),
    ).toEqual({ part: "afternoon", name: "Sam" });
  });

  it("greets by the username without a first name (PRD 0021 edge case)", () => {
    expect(
      greeting(new Date(2026, 10, 9, 8), {
        username: "octocat",
        first_name: "  ",
        last_name: "Cat",
      }),
    ).toEqual({ part: "morning", name: "octocat" });
  });
});

describe("companyInitials", () => {
  it("takes the first letters of the first two words, else the first two letters", () => {
    expect(companyInitials("Northwind Labs")).toBe("NL");
    expect(companyInitials("kite")).toBe("KI");
    expect(companyInitials("  ")).toBe("");
  });
});

describe("timeToStart", () => {
  const NOW = new Date(2026, 10, 9, 11, 45);

  it("counts minutes while less than a day away (in 2h 15m)", () => {
    expect(timeToStart(new Date(2026, 10, 9, 14, 0), NOW)).toEqual({
      kind: "soon",
      minutes: 135,
    });
    expect(timeToStart(new Date(2026, 10, 10, 11, 44), NOW).kind).toBe("soon");
  });

  it("gives the day from a day away (a weekday and a date)", () => {
    const start = new Date(2026, 10, 10, 11, 45);
    expect(timeToStart(start, NOW)).toEqual({ kind: "later", date: start });
  });

  it("never goes below zero", () => {
    expect(timeToStart(new Date(2026, 10, 9, 11, 0), NOW)).toEqual({
      kind: "soon",
      minutes: 0,
    });
  });
});

describe("calendar days", () => {
  it("keys and parses local days, never UTC", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(parseDayKey("2026-01-05")).toEqual(new Date(2026, 0, 5));
    expect(parseDayKey("2026-01-05T22:00:00Z")).toEqual(new Date(2026, 0, 5));
  });

  it("finds the Monday of a week and counts days across months", () => {
    expect(mondayOf(new Date(2026, 10, 15))).toEqual(new Date(2026, 10, 9));
    expect(mondayOf(new Date(2026, 10, 9))).toEqual(new Date(2026, 10, 9));
    expect(addDays(new Date(2026, 9, 30), 3)).toEqual(new Date(2026, 10, 2));
    expect(
      calendarDaysBetween(new Date(2026, 9, 25, 23), new Date(2026, 10, 9, 1)),
    ).toBe(15);
  });
});

function item(overrides: Partial<AgendaStep>): AgendaStep {
  return {
    id: "1",
    step_date: "2026-11-09",
    event_type: "interview",
    interview_type: "technical",
    application_id: "app-1",
    company_name: "Northwind Labs",
    role: "Senior Backend Engineer",
    ...overrides,
  };
}

describe("the next interview", () => {
  // 11:45 in UTC.
  const NOW = new Date(Date.UTC(2026, 10, 9, 11, 45));

  it("is the first one starting at or after now, in its own zone", () => {
    const items = [
      item({ id: "past", start_time: "09:00:00", timezone: "UTC" }),
      item({
        id: "tokyo",
        step_date: "2026-11-10",
        start_time: "08:00:00",
        timezone: "Asia/Tokyo",
      }),
      item({ id: "later-today", start_time: "14:00:00", timezone: "UTC" }),
    ];
    // Tokyo 08:00 on the 10th is 23:00 UTC on the 9th: after 14:00 UTC.
    expect(nextInterview(items, NOW, "UTC")?.id).toBe("later-today");
    expect(upcomingAgenda(items, NOW, "UTC").map((step) => step.id)).toEqual([
      "later-today",
      "tokyo",
    ]);
  });

  it("is none when nothing is coming (no card on Today)", () => {
    expect(
      nextInterview(
        [item({ start_time: "09:00:00", timezone: "UTC" })],
        NOW,
        "UTC",
      ),
    ).toBeNull();
    expect(nextInterview([], NOW, "UTC")).toBeNull();
  });

  it("keeps an untimed step until its day is over", () => {
    const untimed = item({ id: "all-day" });
    expect(nextInterview([untimed], NOW, "UTC")?.id).toBe("all-day");
    expect(agendaTimeToStart(untimed, NOW, "UTC")).toEqual({
      kind: "later",
      date: new Date(2026, 10, 9),
    });
  });

  it("measures the time to start from the step's own zone", () => {
    expect(
      agendaTimeToStart(
        item({ start_time: "14:00:00", timezone: "UTC" }),
        NOW,
        "Asia/Tokyo",
      ),
    ).toEqual({ kind: "soon", minutes: 135 });
  });

  it("puts a timed step on the viewer's day, an untimed one on its own date", () => {
    const tokyoMorning = item({
      step_date: "2026-11-10",
      start_time: "08:00:00",
      timezone: "Asia/Tokyo",
    });
    expect(agendaDay(tokyoMorning, "UTC")).toBe("2026-11-09");
    expect(agendaDay(tokyoMorning, "Asia/Tokyo")).toBe("2026-11-10");
    expect(agendaDay(item({ step_date: "2026-11-12" }), "UTC")).toBe(
      "2026-11-12",
    );
  });
});

describe("stage words", () => {
  it("titles a stage as the boards do", () => {
    expect(stageTitleKey("interview", "technical")).toBe("interview.technical");
    expect(stageTitleKey("interview", null)).toBe("interview.unknown");
    expect(stageTitleKey("offer")).toBe("offer");
  });

  it("puts the interview type on the Agenda pill, else the event type", () => {
    expect(stagePillKey("interview", "initial_screening")).toBe(
      "timeline.interviewType.initial_screening",
    );
    expect(stagePillKey("interview", "unknown")).toBe(
      "timeline.eventType.interview",
    );
    expect(stagePillKey("denied", null)).toBe("timeline.eventType.denied");
  });
});
