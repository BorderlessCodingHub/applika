import { describe, expect, it } from "vitest";

import {
  emptyTimelineEventValues,
  timelineEventSchema,
  timelineEventToFormValues,
  toTimelineEventPayload,
  type TimelineEventFormValues,
} from "./timeline-event-schema";
import type { TimelineEventView } from "@/components/timeline/timeline-types";

/**
 * PRD 0008 / ADR 0012 (frontend): the timeline-event form zod DISCRIMINATED
 * UNION keyed on `event_type`, ported from mynextjob's
 * `timeline-event-schema.test.ts` and extended for the applika-only
 * `interview_type` and the 20-currency / `monthly|annually` offer trio.
 *
 * - interview branch carries `interview_type` (default `unknown`), no salary
 * - offer branch REQUIRES the salary trio (period restricted to
 *   monthly | annually, non-negative numeric amount, one of the 20 currencies)
 * - note/feedback/denied carry neither, and `toTimelineEventPayload` OMITS
 *   both entirely from the wire payload
 * - scheduling fields collapse blanks to `null` on the wire
 */

function offerValues(
  overrides: Partial<TimelineEventFormValues> = {},
): TimelineEventFormValues {
  return {
    ...emptyTimelineEventValues(),
    event_type: "offer",
    event_date: "2026-07-05",
    salary_period: "annually",
    salary_amount: "150000",
    salary_currency: "USD",
    ...overrides,
  } as TimelineEventFormValues;
}

function interviewValues(
  overrides: Partial<TimelineEventFormValues> = {},
): TimelineEventFormValues {
  return {
    ...emptyTimelineEventValues(),
    event_type: "interview",
    event_date: "2026-07-02",
    interview_type: "unknown",
    ...overrides,
  } as TimelineEventFormValues;
}

function noteValues(
  overrides: Partial<TimelineEventFormValues> = {},
): TimelineEventFormValues {
  return {
    ...emptyTimelineEventValues(),
    event_type: "note",
    event_date: "2026-07-02",
    ...overrides,
  } as TimelineEventFormValues;
}

describe("timelineEventSchema — offer variant", () => {
  it("accepts an offer with the full salary trio", () => {
    expect(timelineEventSchema.safeParse(offerValues()).success).toBe(true);
  });

  it("accepts monthly and annually as the offer period", () => {
    expect(
      timelineEventSchema.safeParse(offerValues({ salary_period: "monthly" }))
        .success,
    ).toBe(true);
    expect(
      timelineEventSchema.safeParse(offerValues({ salary_period: "annually" }))
        .success,
    ).toBe(true);
  });

  it("rejects hourly as the offer period (monthly | annually only)", () => {
    const result = timelineEventSchema.safeParse(
      offerValues({ salary_period: "hourly" }),
    );
    expect(result.success).toBe(false);
  });

  it.each([
    ["salary_period", { salary_period: "" }],
    ["salary_amount", { salary_amount: "" }],
    ["salary_currency", { salary_currency: "" }],
  ])("rejects an offer missing %s", (_label, override) => {
    const result = timelineEventSchema.safeParse(offerValues(override));
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric offer amount", () => {
    expect(
      timelineEventSchema.safeParse(offerValues({ salary_amount: "lots" }))
        .success,
    ).toBe(false);
  });

  it("rejects a negative offer amount", () => {
    expect(
      timelineEventSchema.safeParse(offerValues({ salary_amount: "-1" }))
        .success,
    ).toBe(false);
  });

  it("rejects an unknown currency", () => {
    expect(
      timelineEventSchema.safeParse(offerValues({ salary_currency: "XXX" }))
        .success,
    ).toBe(false);
  });

  it("accepts every one of the 20 currencies", () => {
    const CURRENCIES = [
      "USD",
      "BRL",
      "EUR",
      "GBP",
      "CAD",
      "AUD",
      "JPY",
      "CHF",
      "INR",
      "CNY",
      "SEK",
      "NOK",
      "DKK",
      "PLN",
      "SGD",
      "HKD",
      "NZD",
      "MXN",
      "ZAR",
      "AED",
    ];
    expect(CURRENCIES).toHaveLength(20);
    for (const salary_currency of CURRENCIES) {
      expect(
        timelineEventSchema.safeParse(offerValues({ salary_currency })).success,
      ).toBe(true);
    }
  });
});

describe("timelineEventSchema — interview variant", () => {
  it("accepts an interview with the default unknown interview_type", () => {
    const result = timelineEventSchema.safeParse(interviewValues());
    expect(result.success).toBe(true);
  });

  it.each([
    "unknown",
    "initial_screening",
    "technical",
    "cultural",
    "hiring_manager",
    "take_home",
    "final",
  ] as const)("accepts interview_type %s", (interview_type) => {
    expect(
      timelineEventSchema.safeParse(interviewValues({ interview_type }))
        .success,
    ).toBe(true);
  });

  it("rejects an unknown interview_type value", () => {
    const result = timelineEventSchema.safeParse(
      interviewValues({ interview_type: "not-a-type" as never }),
    );
    expect(result.success).toBe(false);
  });
});

describe("timelineEventSchema — non-offer, non-interview variants", () => {
  it.each(["note", "feedback", "denied"] as const)(
    "accepts a %s with no salary fields and no interview_type",
    (event_type) => {
      const result = timelineEventSchema.safeParse(noteValues({ event_type }));
      expect(result.success).toBe(true);
    },
  );

  it("requires a valid event date", () => {
    expect(
      timelineEventSchema.safeParse(noteValues({ event_date: "" })).success,
    ).toBe(false);
    expect(
      timelineEventSchema.safeParse(noteValues({ event_date: "not-a-date" }))
        .success,
    ).toBe(false);
  });
});

describe("toTimelineEventPayload", () => {
  it("sends the salary trio for an offer", () => {
    const payload = toTimelineEventPayload(offerValues());
    expect(payload).toMatchObject({
      event_type: "offer",
      salary_period: "annually",
      salary_amount: "150000",
      salary_currency: "USD",
    });
    expect(payload).not.toHaveProperty("interview_type");
  });

  it("trims the offer amount", () => {
    const payload = toTimelineEventPayload(
      offerValues({ salary_amount: "  150000  " }),
    );
    expect(payload).toHaveProperty("salary_amount", "150000");
  });

  it("sends interview_type for an interview and OMITS the salary trio", () => {
    const payload = toTimelineEventPayload(
      interviewValues({ interview_type: "technical" }),
    );
    expect(payload).toMatchObject({
      event_type: "interview",
      interview_type: "technical",
    });
    expect(payload).not.toHaveProperty("salary_period");
    expect(payload).not.toHaveProperty("salary_amount");
    expect(payload).not.toHaveProperty("salary_currency");
  });

  it("OMITS interview_type and the salary trio for note/feedback/denied", () => {
    const payload = toTimelineEventPayload(
      // Even if stale salary/interview_type strings linger in form state,
      // they are dropped.
      noteValues({
        event_type: "denied",
        interview_type: "technical",
        salary_period: "monthly",
        salary_amount: "999",
        salary_currency: "USD",
      }),
    );
    expect(payload).not.toHaveProperty("interview_type");
    expect(payload).not.toHaveProperty("salary_period");
    expect(payload).not.toHaveProperty("salary_amount");
    expect(payload).not.toHaveProperty("salary_currency");
    expect(payload.event_type).toBe("denied");
  });

  it("collapses blank scheduling fields to null", () => {
    const payload = toTimelineEventPayload(noteValues());
    expect(payload.start_time).toBeNull();
    expect(payload.end_time).toBeNull();
    expect(payload.timezone).toBeNull();
    expect(payload.observation).toBeNull();
  });

  it("keeps provided scheduling fields", () => {
    const payload = toTimelineEventPayload(
      noteValues({
        start_time: "09:00",
        end_time: "10:00",
        timezone: "Europe/London",
        observation: "Phone screen",
      }),
    );
    expect(payload.start_time).toBe("09:00");
    expect(payload.end_time).toBe("10:00");
    expect(payload.timezone).toBe("Europe/London");
    expect(payload.observation).toBe("Phone screen");
  });
});

describe("emptyTimelineEventValues", () => {
  it("defaults to a note on today's date with blank fields", () => {
    const values = emptyTimelineEventValues();
    expect(values.event_type).toBe("note");
    expect(values.event_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(values.salary_period).toBe("");
    expect(values.salary_amount).toBe("");
    expect(values.salary_currency).toBe("");
  });
});

describe("timelineEventToFormValues", () => {
  it("maps a loaded offer event into offer form values", () => {
    const event: TimelineEventView = {
      id: "1",
      type: "offer",
      eventDate: "2026-07-05T00:00:00Z",
      startTime: null,
      endTime: null,
      timezone: null,
      observation: "Verbal offer",
      salaryPeriod: "monthly",
      salaryAmount: "5000",
      salaryCurrency: "EUR",
    };
    const values = timelineEventToFormValues(event);
    expect(values.event_type).toBe("offer");
    // ISO timestamp trimmed to the date input's YYYY-MM-DD.
    expect(values.event_date).toBe("2026-07-05");
    expect(values.salary_period).toBe("monthly");
    expect(values.salary_amount).toBe("5000");
    expect(values.salary_currency).toBe("EUR");
  });

  it("maps a legacy hourly offer with no salary period selected", () => {
    const event: TimelineEventView = {
      id: "1b",
      type: "offer",
      eventDate: "2026-07-05",
      observation: null,
      salaryPeriod: "hourly",
      salaryAmount: "25.50",
      salaryCurrency: "GBP",
    };
    const values = timelineEventToFormValues(event);
    expect(values.event_type).toBe("offer");
    expect(values.salary_period).toBe("");
    // The blank period fails validation until the user picks monthly/annually.
    expect(timelineEventSchema.safeParse(values).success).toBe(false);
  });

  it("maps a loaded interview event with its interview_type", () => {
    const event: TimelineEventView = {
      id: "2",
      type: "interview",
      interviewType: "cultural",
      eventDate: "2026-07-02",
      startTime: "09:00",
      endTime: "10:00",
      timezone: "Europe/London",
      observation: null,
    };
    const values = timelineEventToFormValues(event);
    expect(values.event_type).toBe("interview");
    expect(values.interview_type).toBe("cultural");
    expect(values.start_time).toBe("09:00");
    expect(values.salary_period).toBe("");
  });

  it("defaults a loaded interview event with no interview_type to unknown", () => {
    const event: TimelineEventView = {
      id: "2b",
      type: "interview",
      eventDate: "2026-07-02",
      observation: null,
    };
    const values = timelineEventToFormValues(event);
    expect(values.interview_type).toBe("unknown");
  });

  it("maps a loaded non-offer, non-interview event with blank salary fields", () => {
    const event: TimelineEventView = {
      id: "3",
      type: "note",
      eventDate: "2026-07-02",
      observation: "Some note",
    };
    const values = timelineEventToFormValues(event);
    expect(values.event_type).toBe("note");
    expect(values.salary_period).toBe("");
    expect(values.salary_amount).toBe("");
    expect(values.salary_currency).toBe("");
  });
});
