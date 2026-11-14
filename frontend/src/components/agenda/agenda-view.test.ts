import { describe, expect, it } from "vitest";

import {
  filterAgenda,
  getDisplayTime,
  groupByDate,
  isStepPast,
  splitAgenda,
} from "@/components/agenda/agenda-view";
import type { AgendaStep } from "@/services/types/applications";

const LOCAL_TZ = "America/Sao_Paulo";

function step(overrides: Partial<AgendaStep> = {}): AgendaStep {
  return {
    id: "1",
    step_date: "2026-09-18",
    event_type: "interview",
    interview_type: "technical",
    application_id: "app-1",
    company_name: "Acme",
    role: "Backend engineer",
    ...overrides,
  };
}

describe("isStepPast / splitAgenda — the boundary (R-005)", () => {
  const now = new Date("2026-09-18T14:00:00-03:00"); // 14:00 local (São Paulo)

  it("a timed step today BEFORE now is past", () => {
    const s = step({ start_time: "13:00:00", timezone: LOCAL_TZ });
    expect(isStepPast(s, now, LOCAL_TZ)).toBe(true);
  });

  it("a timed step today AFTER now is upcoming", () => {
    const s = step({ start_time: "15:00:00", timezone: LOCAL_TZ });
    expect(isStepPast(s, now, LOCAL_TZ)).toBe(false);
  });

  it("an untimed step stays upcoming until its day is over", () => {
    const s = step({ start_time: undefined });
    expect(isStepPast(s, now, LOCAL_TZ)).toBe(false);
  });

  it("an untimed step from a past day is past", () => {
    const s = step({ step_date: "2026-09-17", start_time: undefined });
    expect(isStepPast(s, now, LOCAL_TZ)).toBe(true);
  });

  it("converts a step in another timezone before comparing", () => {
    // 13:00 in New York (UTC-4) is 14:00 in São Paulo (UTC-3) — exactly now.
    const s = step({ start_time: "13:00:00", timezone: "America/New_York" });
    expect(isStepPast(s, now, LOCAL_TZ)).toBe(false);
    const sPast = step({
      start_time: "12:59:00",
      timezone: "America/New_York",
    });
    expect(isStepPast(sPast, now, LOCAL_TZ)).toBe(true);
  });

  it("splitAgenda orders upcoming soonest first and past most recent first", () => {
    const items = [
      step({ id: "a", start_time: "16:00:00", timezone: LOCAL_TZ }),
      step({ id: "b", start_time: "15:00:00", timezone: LOCAL_TZ }),
      step({ id: "c", start_time: "10:00:00", timezone: LOCAL_TZ }),
      step({ id: "d", start_time: "11:00:00", timezone: LOCAL_TZ }),
    ];
    const { upcoming, past } = splitAgenda(items, now, LOCAL_TZ);
    expect(upcoming.map((s) => s.id)).toEqual(["b", "a"]);
    expect(past.map((s) => s.id)).toEqual(["d", "c"]);
  });

  it("orders same-day cards by their true instant across DIFFERENT zones, not the raw HH:mm string (AC5)", () => {
    // Both on 2026-09-19. "ny" is 10:00 in New York (UTC-4) = 11:00 São Paulo.
    // "sp" is 10:30 São Paulo, i.e. earlier in real time despite the larger
    // raw string "10:30" > "10:00". A string sort would get this backwards.
    const items = [
      step({
        id: "ny",
        step_date: "2026-09-19",
        start_time: "10:00:00",
        timezone: "America/New_York",
      }),
      step({
        id: "sp",
        step_date: "2026-09-19",
        start_time: "10:30:00",
        timezone: LOCAL_TZ,
      }),
    ];
    const { upcoming } = splitAgenda(items, now, LOCAL_TZ);
    expect(upcoming.map((s) => s.id)).toEqual(["sp", "ny"]);
  });

  it("judges a timed step purely on its own instant, even when a naive step_date-vs-today compare would get it backwards (AC5)", () => {
    // Viewer in Los Angeles at 2026-09-19 22:00 PDT (their "today" is still
    // the 19th). The step's OWN step_date, "2026-09-20", is one day ahead of
    // that only because it was recorded in Tokyo (UTC+9): 00:30 Tokyo on the
    // 20th is 15:30 UTC on the 19th — already several hours BEFORE the
    // viewer's "now" (05:00 UTC on the 20th). A `step_date > today`
    // short-circuit would wrongly call this upcoming; the real instant says
    // it already happened.
    const laNow = new Date("2026-09-19T22:00:00-07:00");
    const s = step({
      step_date: "2026-09-20",
      start_time: "00:30:00",
      timezone: "Asia/Tokyo",
    });
    expect(isStepPast(s, laNow, "America/Los_Angeles")).toBe(true);
  });

  it("judges a timed step upcoming even when its step_date is BEHIND the viewer's today, as long as the real instant has not arrived (AC5, the other cross-midnight direction)", () => {
    // Tokyo viewer at 00:30 on the 19th (their "today" is already the 19th).
    // The step's OWN step_date, "2026-09-18", is one day BEHIND that only
    // because it was recorded in New York (UTC-4): 12:00 New York on the 18th
    // is 16:00 UTC on the 18th, i.e. 01:00 Tokyo on the 19th — 30 minutes
    // AFTER the viewer's "now" (00:30 Tokyo on the 19th). A naive
    // `step_date < today` short-circuit would wrongly call this past; the
    // real instant says it has not started yet.
    const tokyoNow = new Date("2026-09-19T00:30:00+09:00");
    const s = step({
      step_date: "2026-09-18",
      start_time: "12:00:00",
      timezone: "America/New_York",
    });
    expect(isStepPast(s, tokyoNow, "Asia/Tokyo")).toBe(false);
  });
});

describe("getDisplayTime", () => {
  it("returns null for a step with no start_time", () => {
    expect(
      getDisplayTime(step({ start_time: undefined }), LOCAL_TZ),
    ).toBeNull();
  });

  it("returns the raw time uncoverted when the step's zone matches local", () => {
    const display = getDisplayTime(
      step({
        start_time: "14:00:00",
        end_time: "15:00:00",
        timezone: LOCAL_TZ,
      }),
      LOCAL_TZ,
    );
    expect(display).toEqual({
      time: "14:00",
      endTime: "15:00",
      converted: false,
    });
  });

  it("converts and flags converted=true for a different zone", () => {
    const display = getDisplayTime(
      step({
        start_time: "13:00:00",
        end_time: "14:00:00",
        timezone: "America/New_York",
      }),
      LOCAL_TZ,
    );
    expect(display).toEqual({
      time: "14:00",
      endTime: "15:00",
      converted: true,
    });
  });
});

describe("filterAgenda", () => {
  const items = [
    step({ id: "a", company_name: "Acme Corp", role: "Backend Engineer" }),
    step({ id: "b", company_name: "Globex", role: "Frontend Engineer" }),
    step({
      id: "c",
      company_name: "Acme Corp",
      role: "Recruiter",
      interview_type: "hiring_manager",
    }),
  ];

  it("keeps company_name/role matches, case-insensitive substring (R-009)", () => {
    expect(filterAgenda(items, { search: "acme" }).map((s) => s.id)).toEqual([
      "a",
      "c",
    ]);
    expect(
      filterAgenda(items, { search: "ENGINEER" }).map((s) => s.id),
    ).toEqual(["a", "b"]);
  });

  it('"all" or omitted interviewType keeps every item (R-010)', () => {
    expect(filterAgenda(items, { interviewType: "all" })).toHaveLength(3);
    expect(filterAgenda(items, {})).toHaveLength(3);
  });

  it("an exact interviewType keeps only that type", () => {
    expect(
      filterAgenda(items, { interviewType: "hiring_manager" }).map((s) => s.id),
    ).toEqual(["c"]);
  });

  it("does NOT match across fields — a term straddling the company/role boundary finds nothing (AC9)", () => {
    // Company is "Acme Corp", role is "Backend Engineer". "corp backend"
    // matches neither field alone, but WOULD match the concatenated string
    // "acme corp backend engineer" if the two fields were joined with a
    // space before searching — this is the exact bug the fix removes.
    expect(filterAgenda(items, { search: "corp backend" })).toEqual([]);
  });

  it("search and interviewType compose", () => {
    expect(
      filterAgenda(items, { search: "acme", interviewType: "technical" }).map(
        (s) => s.id,
      ),
    ).toEqual(["a"]);
  });
});

describe("groupByDate", () => {
  it("groups two cards on one date together, preserving order (R-006)", () => {
    const items = [
      step({ id: "a", step_date: "2026-09-18" }),
      step({ id: "b", step_date: "2026-09-19" }),
      step({ id: "c", step_date: "2026-09-18" }),
    ];
    const groups = groupByDate(items);
    expect(groups).toEqual([
      { date: "2026-09-18", steps: [items[0], items[2]] },
      { date: "2026-09-19", steps: [items[1]] },
    ]);
  });

  it("counts follow: one group has count 2, the other count 1", () => {
    const items = [
      step({ id: "a", step_date: "2026-09-18" }),
      step({ id: "b", step_date: "2026-09-19" }),
      step({ id: "c", step_date: "2026-09-18" }),
    ];
    const groups = groupByDate(items);
    expect(groups.map((g) => g.steps.length)).toEqual([2, 1]);
  });
});
