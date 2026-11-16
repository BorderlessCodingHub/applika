import { describe, expect, it } from "vitest";

import {
  PIPELINE_STAGES,
  STALE_DAYS,
  ago,
  attentionList,
  groupByStage,
  isStale,
  lastUpdate,
  pipelineOutcome,
  pipelineStage,
  quietDays,
  reachedStage,
  type PipelineApplication,
} from "./pipeline";
import type { InterviewType } from "@/components/timeline/timeline-types";
import type { ApplicationLastEvent } from "@/services/types/applications";

// A local calendar day: the clock the screens read.
const TODAY = new Date(2026, 10, 9, 15, 30);

function app(
  overrides: Partial<PipelineApplication> & { id?: string } = {},
): PipelineApplication & { id: string } {
  return {
    id: "a1",
    application_date: "2026-11-01",
    finalized_at: null,
    last_event: null,
    ...overrides,
  };
}

/** `last_event` of one kind: an interview by its type, an offer or a denial. */
const event = (
  kind: InterviewType | "offer" | "denied",
  date = "2026-11-03",
): ApplicationLastEvent => ({
  id: "e1",
  event_type: kind === "offer" || kind === "denied" ? kind : "interview",
  interview_type: kind === "offer" || kind === "denied" ? null : kind,
  denied_reason: kind === "denied" ? "unknown" : null,
  date,
});

describe("pipelineStage", () => {
  it("reads Applied with no event yet", () => {
    expect(pipelineStage(app())).toBe("applied");
    expect(pipelineStage(app({ last_event: undefined }))).toBe("applied");
  });

  it("reads Screening from the initial screening", () => {
    expect(pipelineStage(app({ last_event: event("initial_screening") }))).toBe(
      "screening",
    );
  });

  it("reads Technical from any other interview", () => {
    expect(pipelineStage(app({ last_event: event("technical") }))).toBe(
      "technical",
    );
    expect(pipelineStage(app({ last_event: event("cultural") }))).toBe(
      "technical",
    );
  });

  it("reads Offer from an open application's offer", () => {
    expect(pipelineStage(app({ last_event: event("offer") }))).toBe("offer");
  });

  it("lists an open application whose latest event is a denial under Closed", () => {
    expect(pipelineStage(app({ last_event: event("denied") }))).toBe("closed");
  });

  it("reads Closed once finalized_at is set, whatever the latest event", () => {
    expect(
      pipelineStage(
        app({
          finalized_at: "2026-11-05T10:00:00Z",
          last_event: event("technical"),
        }),
      ),
    ).toBe("closed");
    expect(pipelineStage(app({ finalized_at: "2026-11-05T10:00:00Z" }))).toBe(
      "closed",
    );
  });
});

describe("pipelineOutcome", () => {
  it("names a closed application's offer or denial", () => {
    const closed = { finalized_at: "2026-11-05T10:00:00Z" };
    expect(
      pipelineOutcome(app({ ...closed, last_event: event("offer") })),
    ).toBe("offer");
    expect(
      pipelineOutcome(app({ ...closed, last_event: event("denied") })),
    ).toBe("denied");
    expect(
      pipelineOutcome(app({ ...closed, last_event: event("technical") })),
    ).toBeNull();
  });

  it("names an open application's denial (it sits under Closed) but not its offer", () => {
    expect(pipelineOutcome(app({ last_event: event("denied") }))).toBe(
      "denied",
    );
    expect(pipelineOutcome(app({ last_event: event("offer") }))).toBeNull();
  });
});

describe("lastUpdate and isStale", () => {
  it("takes the later of the application date and the latest event's date", () => {
    expect(lastUpdate(app())).toBe("2026-11-01");
    expect(
      lastUpdate(app({ last_event: event("technical", "2026-11-04") })),
    ).toBe("2026-11-04");
    // An event dated before the application does not move it back.
    expect(
      lastUpdate(app({ last_event: event("technical", "2026-10-20") })),
    ).toBe("2026-11-01");
  });

  it("is stale after more than 14 days: 15 is, 14 is not", () => {
    expect(STALE_DAYS).toBe(14);
    const fourteen = app({ application_date: "2026-10-26" });
    const fifteen = app({ application_date: "2026-10-25" });
    expect(quietDays(fourteen, TODAY)).toBe(14);
    expect(isStale(fourteen, TODAY)).toBe(false);
    expect(quietDays(fifteen, TODAY)).toBe(15);
    expect(isStale(fifteen, TODAY)).toBe(true);
  });

  it("counts from the latest event when it is later", () => {
    const refreshed = app({
      application_date: "2026-09-01",
      last_event: event("initial_screening", "2026-11-02"),
    });
    expect(quietDays(refreshed, TODAY)).toBe(7);
    expect(isStale(refreshed, TODAY)).toBe(false);
  });

  it("never marks a closed application stale", () => {
    expect(
      isStale(
        app({
          application_date: "2026-01-01",
          finalized_at: "2026-02-01T00:00:00Z",
        }),
        TODAY,
      ),
    ).toBe(false);
  });

  it("counts local calendar days, at any hour of the day", () => {
    const late = new Date(2026, 10, 9, 23, 59);
    const early = new Date(2026, 10, 9, 0, 1);
    const a = app({ application_date: "2026-10-25" });
    expect(quietDays(a, late)).toBe(15);
    expect(quietDays(a, early)).toBe(15);
  });
});

describe("ago", () => {
  it("speaks days below a week, weeks below eight, then months", () => {
    expect(ago(0)).toEqual({ unit: "day", count: 0 });
    expect(ago(6)).toEqual({ unit: "day", count: 6 });
    expect(ago(7)).toEqual({ unit: "week", count: 1 });
    expect(ago(55)).toEqual({ unit: "week", count: 7 });
    expect(ago(56)).toEqual({ unit: "month", count: 1 });
    expect(ago(95)).toEqual({ unit: "month", count: 3 });
  });

  it("never goes below zero", () => {
    expect(ago(-3)).toEqual({ unit: "day", count: 0 });
  });
});

describe("groupByStage", () => {
  it("groups in the board's order, leaves empty stages out, newest update first", () => {
    const groups = groupByStage(
      [
        app({ id: "applied-old", application_date: "2026-10-01" }),
        app({ id: "applied-new", application_date: "2026-11-08" }),
        app({ id: "tech", last_event: event("technical") }),
        app({ id: "denied", last_event: event("denied") }),
        app({ id: "offer", last_event: event("offer") }),
      ],
      TODAY,
    );
    expect(groups.map((group) => group.stage)).toEqual([
      "technical",
      "applied",
      "offer",
      "closed",
    ]);
    expect(
      groups
        .find((group) => group.stage === "applied")!
        .rows.map((row) => row.app.id),
    ).toEqual(["applied-new", "applied-old"]);
    const closed = groups.find((group) => group.stage === "closed")!.rows[0];
    expect(closed.outcome).toBe("denied");
  });

  it("keeps the stage order Technical, Screening, Applied, Offer, Closed", () => {
    expect(PIPELINE_STAGES).toEqual([
      "technical",
      "screening",
      "applied",
      "offer",
      "closed",
    ]);
  });

  it("marks the stale rows with their days", () => {
    const [group] = groupByStage(
      [app({ application_date: "2026-10-20" })],
      TODAY,
    );
    expect(group.rows[0]).toMatchObject({ days: 20, stale: true });
  });
});

describe("attentionList", () => {
  it("lists only the stale open applications, most days first", () => {
    const list = attentionList(
      [
        app({ id: "fresh", application_date: "2026-11-08" }),
        app({ id: "twenty", application_date: "2026-10-20" }),
        app({ id: "forty", application_date: "2026-09-30" }),
        app({
          id: "closed",
          application_date: "2026-01-01",
          finalized_at: "2026-02-01T00:00:00Z",
        }),
      ],
      TODAY,
    );
    expect(list.map(({ app: item, days }) => [item.id, days])).toEqual([
      ["forty", 40],
      ["twenty", 20],
    ]);
  });

  it("is empty when every application has a recent update", () => {
    expect(
      attentionList([app({ application_date: "2026-11-01" })], TODAY),
    ).toEqual([]);
  });

  it("leaves out an open application whose latest event is a denial, however quiet", () => {
    const denied = app({
      id: "denied",
      application_date: "2026-09-01",
      last_event: event("denied", "2026-09-10"),
    });
    const list = attentionList(
      [
        denied,
        app({
          id: "offer",
          application_date: "2026-09-01",
          last_event: event("offer", "2026-09-20"),
        }),
        app({
          id: "interview",
          application_date: "2026-09-01",
          last_event: event("technical", "2026-10-01"),
        }),
      ],
      TODAY,
    );
    expect(list.map(({ app: item, days }) => [item.id, days])).toEqual([
      ["offer", 50],
      ["interview", 39],
    ]);
    // Still stale and still under Closed on the Pipeline (P6).
    expect(isStale(denied, TODAY)).toBe(true);
    expect(groupByStage([denied], TODAY)).toEqual([
      {
        stage: "closed",
        rows: [
          {
            app: denied,
            stage: "closed",
            outcome: "denied",
            days: 60,
            stale: true,
          },
        ],
      },
    ]);
  });
});

describe("reachedStage", () => {
  it("takes the furthest stage of the timeline", () => {
    expect(reachedStage(app(), [])).toBe("applied");
    expect(
      reachedStage(app(), [
        { event_type: "interview", interview_type: "initial_screening" },
      ]),
    ).toBe("screening");
    expect(
      reachedStage(app(), [
        { event_type: "interview", interview_type: "technical" },
        { event_type: "interview", interview_type: "initial_screening" },
        { event_type: "denied", interview_type: null },
      ]),
    ).toBe("technical");
    expect(
      reachedStage(app(), [
        { event_type: "interview", interview_type: "unknown" },
        { event_type: "offer", interview_type: null },
      ]),
    ).toBe("offer");
  });

  it("falls back to last_event while the timeline loads", () => {
    expect(reachedStage(app({ last_event: event("initial_screening") }))).toBe(
      "screening",
    );
    expect(reachedStage(app({ last_event: event("denied") }))).toBe("applied");
  });
});
