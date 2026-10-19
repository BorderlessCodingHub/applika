import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CLOSING_DATE_MESSAGE,
  emptyCloseValues,
  emptyTimelineEventValues,
  timelineEventSchema,
  timelineEventToFormValues,
  toFinalizeOutcomePayload,
  toTimelineEventPayload,
  type TimelineEventCloseValues,
  type TimelineEventEventValues,
  type TimelineEventFormValues,
} from "./timeline-event-schema";
import { browserTimeZone } from "@/components/timeline/timezone-options";
import type { TimelineEventView } from "@/components/timeline/timeline-types";

/**
 * PRD 0008 / ADR 0012 (frontend): the timeline-event form zod DISCRIMINATED
 * UNION keyed on `event_type`, including
 * `interview_type` and the 20-currency / `monthly|annually` offer trio, plus
 * KODI-014's `denied_reason`.
 *
 * - interview branch carries `interview_type` (default `unknown`), no salary,
 *   no reason, and is the ONLY branch with a schedule (start/end/timezone)
 * - offer branch REQUIRES the salary trio (period restricted to
 *   monthly | annually, non-negative numeric amount, one of the 20 currencies)
 * - denied branch REQUIRES `denied_reason` (one of the 10 hardcoded reasons,
 *   default `unknown`)
 * - note/feedback are gone (ADR 0020): the union refuses them, and
 *   `toTimelineEventPayload` OMITS every field a type does not carry
 * - scheduling fields collapse blanks to `null` on the wire and are sent ONLY
 *   for `interview`; every other `event_type` OMITS the three keys entirely
 *   (KODI-016), on CREATE and EDIT alike, replacing KODI-014's interim rule
 *   that kept an already non-interview event's stored schedule on edit
 */

function offerValues(
  overrides: Partial<TimelineEventFormValues> = {},
): TimelineEventEventValues {
  return {
    ...emptyTimelineEventValues(),
    event_type: "offer",
    event_date: "2026-07-05",
    salary_period: "annually",
    salary_amount: "150000",
    salary_currency: "USD",
    ...overrides,
  } as TimelineEventEventValues;
}

function interviewValues(
  overrides: Partial<TimelineEventFormValues> = {},
): TimelineEventEventValues {
  return {
    ...emptyTimelineEventValues(),
    event_type: "interview",
    event_date: "2026-07-02",
    interview_type: "unknown",
    ...overrides,
  } as TimelineEventEventValues;
}

function deniedValues(
  overrides: Partial<TimelineEventFormValues> = {},
): TimelineEventEventValues {
  return {
    ...emptyTimelineEventValues(),
    event_type: "denied",
    event_date: "2026-07-02",
    denied_reason: "unknown",
    ...overrides,
  } as TimelineEventEventValues;
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

describe("timelineEventSchema — denied variant (KODI-014)", () => {
  it("accepts a denied event with the default unknown reason", () => {
    expect(timelineEventSchema.safeParse(deniedValues()).success).toBe(true);
  });

  it.each([
    "unknown",
    "not_good_enough",
    "skills_mismatch",
    "assessment_failed",
    "too_many_candidates",
    "position_filled",
    "role_closed",
    "ghosted",
    "salary_mismatch",
    "other",
  ] as const)("accepts denied_reason %s", (denied_reason) => {
    expect(
      timelineEventSchema.safeParse(deniedValues({ denied_reason })).success,
    ).toBe(true);
  });

  it("rejects a blank denied_reason", () => {
    const result = timelineEventSchema.safeParse(
      deniedValues({ denied_reason: "" as never }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an unknown denied_reason value", () => {
    const result = timelineEventSchema.safeParse(
      deniedValues({ denied_reason: "not-a-reason" as never }),
    );
    expect(result.success).toBe(false);
  });
});

describe("timelineEventSchema — only interview, offer and denied (ADR 0020)", () => {
  it.each(["note", "feedback"] as const)(
    "refuses a %s, the types the API no longer accepts",
    (event_type) => {
      const result = timelineEventSchema.safeParse(
        deniedValues({ event_type: event_type as never }),
      );
      expect(result.success).toBe(false);
    },
  );

  it("requires a valid event date", () => {
    expect(
      timelineEventSchema.safeParse(deniedValues({ event_date: "" })).success,
    ).toBe(false);
    expect(
      timelineEventSchema.safeParse(deniedValues({ event_date: "not-a-date" }))
        .success,
    ).toBe(false);
  });
});

describe("timelineEventSchema — server-limit parity (mirrors _TimelineEventWrite)", () => {
  // The schedule (start_time/end_time) pairing is validated ONLY for
  // `interview` (KODI-014): the schedule group is unmounted for every other
  // type, so its rule must not reach an offer/denied event.
  it("rejects an interview with a start time and no end time, and vice versa", () => {
    expect(
      timelineEventSchema.safeParse(interviewValues({ start_time: "09:00" }))
        .success,
    ).toBe(false);
    expect(
      timelineEventSchema.safeParse(interviewValues({ end_time: "10:00" }))
        .success,
    ).toBe(false);
  });

  it("accepts an interview start/end pair with the end after the start", () => {
    expect(
      timelineEventSchema.safeParse(
        interviewValues({ start_time: "09:00", end_time: "10:00" }),
      ).success,
    ).toBe(true);
  });

  it("rejects an interview end time at or before the start time", () => {
    expect(
      timelineEventSchema.safeParse(
        interviewValues({ start_time: "10:00", end_time: "10:00" }),
      ).success,
    ).toBe(false);
    expect(
      timelineEventSchema.safeParse(
        interviewValues({ start_time: "10:00", end_time: "09:00" }),
      ).success,
    ).toBe(false);
  });

  it("does not validate the schedule pairing for a non-interview event (the schedule group is unmounted)", () => {
    expect(
      timelineEventSchema.safeParse(deniedValues({ start_time: "09:00" }))
        .success,
    ).toBe(true);
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ start_time: "10:00", end_time: "09:00" }),
      ).success,
    ).toBe(true);
  });

  it("rejects a timezone longer than 100 characters", () => {
    expect(
      timelineEventSchema.safeParse(deniedValues({ timezone: "a".repeat(101) }))
        .success,
    ).toBe(false);
    expect(
      timelineEventSchema.safeParse(deniedValues({ timezone: "a".repeat(100) }))
        .success,
    ).toBe(true);
  });

  it("rejects an observation longer than 5000 characters", () => {
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ observation: "a".repeat(5001) }),
      ).success,
    ).toBe(false);
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ observation: "a".repeat(5000) }),
      ).success,
    ).toBe(true);
  });

  it("rejects an offer amount with more than 2 decimal places", () => {
    expect(
      timelineEventSchema.safeParse(offerValues({ salary_amount: "100.555" }))
        .success,
    ).toBe(false);
  });

  it("rejects an offer amount with more than 10 integer digits", () => {
    expect(
      timelineEventSchema.safeParse(
        offerValues({ salary_amount: "12345678901" }),
      ).success,
    ).toBe(false);
  });

  it("accepts an offer amount at the limit (10 digits, 2 decimals)", () => {
    expect(
      timelineEventSchema.safeParse(
        offerValues({ salary_amount: "1234567890.12" }),
      ).success,
    ).toBe(true);
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
    expect(payload).not.toHaveProperty("denied_reason");
  });

  it("trims the offer amount", () => {
    const payload = toTimelineEventPayload(
      offerValues({ salary_amount: "  150000  " }),
    );
    expect(payload).toHaveProperty("salary_amount", "150000");
  });

  it("sends interview_type for an interview and OMITS the salary trio and denied_reason", () => {
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
    expect(payload).not.toHaveProperty("denied_reason");
  });

  it("sends denied_reason for a denied event and OMITS interview_type and the salary trio (KODI-014)", () => {
    const payload = toTimelineEventPayload(
      deniedValues({ denied_reason: "skills_mismatch" }),
    );
    expect(payload).toMatchObject({
      event_type: "denied",
      denied_reason: "skills_mismatch",
    });
    expect(payload).not.toHaveProperty("interview_type");
    expect(payload).not.toHaveProperty("salary_period");
    expect(payload).not.toHaveProperty("salary_amount");
    expect(payload).not.toHaveProperty("salary_currency");
  });

  it("drops stale interview_type and salary strings from a denied event's payload", () => {
    const payload = toTimelineEventPayload(
      // Even if stale salary/interview_type strings linger in form state
      // (e.g. left over from a type the user picked and then changed away
      // from), they are dropped.
      deniedValues({
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

  it("omits the scheduling fields for a non-interview event, and still collapses observation to null", () => {
    const payload = toTimelineEventPayload(deniedValues());
    expect(payload).not.toHaveProperty("start_time");
    expect(payload).not.toHaveProperty("end_time");
    expect(payload).not.toHaveProperty("timezone");
    expect(payload.observation).toBeNull();
  });

  it("keeps provided scheduling fields for an interview", () => {
    const payload = toTimelineEventPayload(
      interviewValues({
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

  it("nulls the timezone for an interview with no start time, even if a value is pre-filled", () => {
    const payload = toTimelineEventPayload(
      interviewValues({ start_time: "", end_time: "", timezone: "UTC" }),
    );
    expect(payload.start_time).toBeNull();
    expect(payload.end_time).toBeNull();
    expect(payload.timezone).toBeNull();
  });

  it("omits the schedule for a non-interview event even if stale values linger in form state", () => {
    const payload = toTimelineEventPayload(
      deniedValues({
        start_time: "09:00",
        end_time: "10:00",
        timezone: "Europe/London",
        observation: "Phone screen",
      }),
    );
    expect(payload).not.toHaveProperty("start_time");
    expect(payload).not.toHaveProperty("end_time");
    expect(payload).not.toHaveProperty("timezone");
    // Only the schedule is omitted — the observation is a real field on
    // every type and must survive.
    expect(payload.observation).toBe("Phone screen");
  });

  it("omits the schedule when CREATING a denied event, even if stale values linger in form state", () => {
    const payload = toTimelineEventPayload(
      deniedValues({
        start_time: "09:00",
        end_time: "10:00",
        timezone: "Europe/London",
      }),
    );
    expect(payload).not.toHaveProperty("start_time");
    expect(payload).not.toHaveProperty("end_time");
    expect(payload).not.toHaveProperty("timezone");
  });

  // KODI-016: a non-interview event never sends a schedule — on CREATE or
  // EDIT, whatever was stored. This replaces KODI-014's interim rule, which
  // sent an already non-interview event's STORED schedule back unchanged on
  // an edit that left the type alone.
  describe("a non-interview event never sends a schedule (KODI-016)", () => {
    it.each(["offer", "denied"] as const)(
      "omits the schedule when editing a stored %s that already carries a legacy schedule",
      (type) => {
        const stored: TimelineEventView = {
          id: "orig-1",
          type,
          eventDate: "2026-07-02",
          startTime: "09:00",
          endTime: "10:00",
          timezone: "Europe/London",
          observation: "Old note",
          ...(type === "offer"
            ? {
                salaryPeriod: "monthly" as const,
                salaryAmount: "5000",
                salaryCurrency: "EUR",
              }
            : {}),
          ...(type === "denied" ? { deniedReason: "unknown" as const } : {}),
        };
        // The edit form is seeded from the STORED event (proving this is a
        // real edit of a record that already had a schedule), then the user
        // changes only the observation.
        const formValues = timelineEventToFormValues(stored);
        const payload = toTimelineEventPayload({
          ...formValues,
          observation: "New note",
        });

        expect(payload).not.toHaveProperty("start_time");
        expect(payload).not.toHaveProperty("end_time");
        expect(payload).not.toHaveProperty("timezone");
        expect(payload.observation).toBe("New note");
      },
    );

    it("omits the schedule when editing switches the type FROM interview TO a non-interview type", () => {
      const stored: TimelineEventView = {
        id: "orig-3",
        type: "interview",
        interviewType: "technical",
        eventDate: "2026-07-02",
        startTime: "09:00",
        endTime: "10:00",
        timezone: "Europe/London",
        observation: "Old note",
      };
      const formValues = timelineEventToFormValues(stored);
      const payload = toTimelineEventPayload({
        ...formValues,
        event_type: "denied",
        denied_reason: "unknown",
        observation: "Switched to denied",
      } as TimelineEventEventValues);

      expect(payload).not.toHaveProperty("start_time");
      expect(payload).not.toHaveProperty("end_time");
      expect(payload).not.toHaveProperty("timezone");
    });

    it("omits the schedule when CREATING a non-interview event", () => {
      const payload = toTimelineEventPayload(deniedValues());
      expect(payload).not.toHaveProperty("start_time");
      expect(payload).not.toHaveProperty("end_time");
      expect(payload).not.toHaveProperty("timezone");
    });

    it("still applies the interview nulling rules unaffected by the non-interview omission", () => {
      // Editing the interview and blanking the start time still nulls the
      // timezone, exactly as before (unchanged interview behaviour) — the
      // fields are still PRESENT (nulled), never omitted, for an interview.
      const payload = toTimelineEventPayload(
        interviewValues({
          start_time: "",
          end_time: "",
          timezone: "UTC",
          observation: "Blanked schedule",
        }),
      );
      expect(payload.start_time).toBeNull();
      expect(payload.end_time).toBeNull();
      expect(payload.timezone).toBeNull();
    });
  });
});

describe("emptyTimelineEventValues", () => {
  it("defaults to an interview of type unknown on today's date with blank fields", () => {
    const values = emptyTimelineEventValues();
    expect(values.close_application).toBe(false);
    expect(values.event_type).toBe("interview");
    expect(values.interview_type).toBe("unknown");
    expect(values.event_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(values.salary_period).toBe("");
    expect(values.salary_amount).toBe("");
    expect(values.salary_currency).toBe("");
    expect(values.denied_reason).toBe("");
  });

  it("pre-fills the timezone with the browser's own zone (KODI-014)", () => {
    expect(emptyTimelineEventValues().timezone).toBe(browserTimeZone());
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
    expect(values.denied_reason).toBe("");
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

  it("maps a loaded non-offer event with blank salary fields", () => {
    const event: TimelineEventView = {
      id: "3",
      type: "denied",
      eventDate: "2026-07-02",
      observation: "Some note",
    };
    const values = timelineEventToFormValues(event);
    expect(values.event_type).toBe("denied");
    expect(values.salary_period).toBe("");
    expect(values.salary_amount).toBe("");
    expect(values.salary_currency).toBe("");
    expect(values.interview_type).toBe("");
  });

  describe("denied reason (KODI-014)", () => {
    it("maps a loaded denied event's stored reason", () => {
      const event: TimelineEventView = {
        id: "4",
        type: "denied",
        deniedReason: "position_filled",
        eventDate: "2026-07-02",
        observation: null,
      };
      const values = timelineEventToFormValues(event);
      expect(values.event_type).toBe("denied");
      expect(values.denied_reason).toBe("position_filled");
    });

    it("defaults a loaded denied event with no stored reason to unknown", () => {
      const event: TimelineEventView = {
        id: "4b",
        type: "denied",
        eventDate: "2026-07-02",
        observation: null,
      };
      const values = timelineEventToFormValues(event);
      expect(values.denied_reason).toBe("unknown");
    });
  });

  describe("timezone (KODI-014)", () => {
    it("the stored timezone wins over the browser's own zone", () => {
      const event: TimelineEventView = {
        id: "5",
        type: "interview",
        eventDate: "2026-07-02",
        timezone: "Pacific/Auckland",
        observation: null,
      };
      expect(timelineEventToFormValues(event).timezone).toBe(
        "Pacific/Auckland",
      );
    });

    it("the stored timezone wins even when the browser does not list it", () => {
      const event: TimelineEventView = {
        id: "5b",
        type: "interview",
        eventDate: "2026-07-02",
        // Not a real IANA id: proves the mapper never filters against
        // `Intl.supportedValuesOf("timeZone")` — the select still shows and
        // checks it (see timezone-select.test.tsx for the rendered picker).
        timezone: "Legacy/Not-A-Real-Zone",
        observation: null,
      };
      expect(timelineEventToFormValues(event).timezone).toBe(
        "Legacy/Not-A-Real-Zone",
      );
    });

    it("falls back to the browser's zone when nothing is stored", () => {
      const event: TimelineEventView = {
        id: "5c",
        type: "denied",
        eventDate: "2026-07-02",
        timezone: null,
        observation: null,
      };
      expect(timelineEventToFormValues(event).timezone).toBe(browserTimeZone());
    });
  });
});

// ---------------------------------------------------------------------------
// Close mode: the `none` branch, `close_application`, the closing date and
// `toFinalizeOutcomePayload` (the old close dialog's `toFinalizePayload`,
// ported whole).
// ---------------------------------------------------------------------------

function localIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysFromToday(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIso(date);
}

function closeValues(
  overrides: Partial<TimelineEventFormValues> = {},
): TimelineEventCloseValues {
  return {
    ...emptyCloseValues(),
    event_date: "2026-09-10",
    denied_reason: "unknown",
    ...overrides,
  } as TimelineEventCloseValues;
}

describe("emptyCloseValues", () => {
  it("opens on None, today, blank fields, and always closes", () => {
    const values = emptyCloseValues();
    expect(values).toEqual({
      event_type: "none",
      event_date: localIso(new Date()),
      start_time: "",
      end_time: "",
      timezone: "",
      observation: "",
      interview_type: "",
      denied_reason: "",
      salary_period: "",
      salary_amount: "",
      salary_currency: "",
      close_application: true,
    });
    expect(timelineEventSchema.safeParse(values).success).toBe(true);
  });
});

describe("close_application on Add event and Edit event", () => {
  it("is false for a new event and for every edited type", () => {
    expect(emptyTimelineEventValues().close_application).toBe(false);
    for (const type of ["interview", "offer", "denied"] as const) {
      const values = timelineEventToFormValues({
        id: "e",
        type,
        eventDate: "2026-07-02",
        startTime: null,
        endTime: null,
        timezone: null,
        observation: null,
      });
      expect(values.close_application).toBe(false);
    }
  });

  it("is required on every branch", () => {
    const { close_application: _omit, ...withoutFlag } = deniedValues();
    void _omit;
    expect(timelineEventSchema.safeParse(withoutFlag).success).toBe(false);
    const { close_application: _omitNone, ...noneWithoutFlag } =
      emptyCloseValues();
    void _omitNone;
    expect(timelineEventSchema.safeParse(noneWithoutFlag).success).toBe(false);
  });
});

describe("timelineEventSchema — the none branch validates nothing", () => {
  it("accepts a stale over-limit note, a blank date and stale offer values", () => {
    const result = timelineEventSchema.safeParse(
      closeValues({
        event_type: "none",
        observation: "a".repeat(5001),
        event_date: "",
        salary_amount: "100.555",
        salary_period: "hourly",
        denied_reason: "not-a-reason",
        start_time: "10:00",
        end_time: "09:00",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts a future date: None records no event, so it has no date", () => {
    expect(
      timelineEventSchema.safeParse(
        closeValues({ event_type: "none", event_date: daysFromToday(3) }),
      ).success,
    ).toBe(true);
  });
});

describe("timelineEventSchema — the closing date stops at today", () => {
  it.each(["offer", "denied"] as const)(
    "a closing %s dated later than today is refused with the closing message",
    (type) => {
      const values =
        type === "offer"
          ? offerValues({
              close_application: true,
              event_date: daysFromToday(1),
            })
          : deniedValues({
              close_application: true,
              event_date: daysFromToday(1),
            });
      const result = timelineEventSchema.safeParse(values);
      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["event_date"],
            message: CLOSING_DATE_MESSAGE,
          }),
        ]),
      );
      expect(CLOSING_DATE_MESSAGE).toBe(
        "Pick today or an earlier date to close the application",
      );
    },
  );

  it.each(["offer", "denied"] as const)(
    "a closing %s dated today or earlier is accepted",
    (type) => {
      const build = type === "offer" ? offerValues : deniedValues;
      for (const event_date of [daysFromToday(0), daysFromToday(-30)]) {
        expect(
          timelineEventSchema.safeParse(
            build({ close_application: true, event_date }),
          ).success,
        ).toBe(true);
      }
    },
  );

  it("an event that does not close keeps any date (Add event, Edit event)", () => {
    expect(
      timelineEventSchema.safeParse(
        deniedValues({
          close_application: false,
          event_date: daysFromToday(5),
        }),
      ).success,
    ).toBe(true);
    expect(
      timelineEventSchema.safeParse(
        offerValues({ close_application: false, event_date: daysFromToday(5) }),
      ).success,
    ).toBe(true);
  });

  describe("compares against the user's LOCAL day, never UTC's", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it("Tokyo at 22:30 UTC: the local today is accepted, the local tomorrow refused", () => {
      vi.stubEnv("TZ", "Asia/Tokyo");
      vi.useFakeTimers({ toFake: ["Date"] });
      // 2026-10-15 22:30 UTC is 2026-10-16 07:30 in Tokyo.
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 15, 22, 30)));
      expect(
        timelineEventSchema.safeParse(
          deniedValues({ close_application: true, event_date: "2026-10-16" }),
        ).success,
      ).toBe(true);
      expect(
        timelineEventSchema.safeParse(
          deniedValues({ close_application: true, event_date: "2026-10-17" }),
        ).success,
      ).toBe(false);
    });

    it("Honolulu at 08:30 UTC: the local today is accepted, UTC's today refused", () => {
      vi.stubEnv("TZ", "Pacific/Honolulu");
      vi.useFakeTimers({ toFake: ["Date"] });
      // 2026-10-16 08:30 UTC is 2026-10-15 22:30 in Honolulu.
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 16, 8, 30)));
      expect(
        timelineEventSchema.safeParse(
          deniedValues({ close_application: true, event_date: "2026-10-15" }),
        ).success,
      ).toBe(true);
      expect(
        timelineEventSchema.safeParse(
          deniedValues({ close_application: true, event_date: "2026-10-16" }),
        ).success,
      ).toBe(false);
    });
  });

  it("an interview never closes, so the flag never caps its date", () => {
    expect(
      timelineEventSchema.safeParse(
        interviewValues({
          close_application: true,
          event_date: daysFromToday(5),
        }),
      ).success,
    ).toBe(true);
  });
});

describe("timelineEventSchema — closing limits equal the old close dialog's (FinalizeWithOutcome)", () => {
  const closing = { close_application: true, event_date: "2026-09-10" };

  it("notes: 5000 accepted, 5001 refused", () => {
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ ...closing, observation: "a".repeat(5000) }),
      ).success,
    ).toBe(true);
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ ...closing, observation: "a".repeat(5001) }),
      ).success,
    ).toBe(false);
  });

  it("amount: up to 10 digits and 2 decimals, non-negative, required", () => {
    for (const ok of ["0", "1234567890", "1234567890.12", "9.5"]) {
      expect(
        timelineEventSchema.safeParse(
          offerValues({ ...closing, salary_amount: ok }),
        ).success,
      ).toBe(true);
    }
    for (const bad of ["", "12345678901", "100.555", "-1", "abc"]) {
      expect(
        timelineEventSchema.safeParse(
          offerValues({ ...closing, salary_amount: bad }),
        ).success,
      ).toBe(false);
    }
  });

  it("period: monthly and annually only, never hourly or blank", () => {
    for (const ok of ["monthly", "annually"]) {
      expect(
        timelineEventSchema.safeParse(
          offerValues({ ...closing, salary_period: ok as never }),
        ).success,
      ).toBe(true);
    }
    for (const bad of ["hourly", ""]) {
      expect(
        timelineEventSchema.safeParse(
          offerValues({ ...closing, salary_period: bad as never }),
        ).success,
      ).toBe(false);
    }
  });

  it("currency: one of the 20, required", () => {
    expect(
      timelineEventSchema.safeParse(
        offerValues({ ...closing, salary_currency: "" as never }),
      ).success,
    ).toBe(false);
    expect(
      timelineEventSchema.safeParse(
        offerValues({ ...closing, salary_currency: "XYZ" as never }),
      ).success,
    ).toBe(false);
  });

  it("denied reason: one of the 10 DENIED_REASONS", () => {
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ ...closing, denied_reason: "position_filled" }),
      ).success,
    ).toBe(true);
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ ...closing, denied_reason: "bored" as never }),
      ).success,
    ).toBe(false);
  });

  it("date: required on a closing Offer or Denied", () => {
    expect(
      timelineEventSchema.safeParse(
        deniedValues({ ...closing, event_date: "" }),
      ).success,
    ).toBe(false);
  });
});

describe("toFinalizeOutcomePayload", () => {
  it("none sends no body at all", () => {
    expect(
      toFinalizeOutcomePayload(closeValues({ event_type: "none" })),
    ).toBeUndefined();
  });

  it("denied sends the date, trimmed notes and denied_reason, never salary keys", () => {
    const payload = toFinalizeOutcomePayload(
      closeValues({ event_type: "denied", observation: "  Not a fit  " }),
    );
    expect(payload).toEqual({
      outcome: "denied",
      event_date: "2026-09-10",
      observation: "Not a fit",
      denied_reason: "unknown",
    });
    expect(payload).not.toHaveProperty("salary_amount");
    expect(payload).not.toHaveProperty("salary_currency");
    expect(payload).not.toHaveProperty("salary_period");
  });

  it("denied sends the picked reason", () => {
    expect(
      toFinalizeOutcomePayload(
        closeValues({ event_type: "denied", denied_reason: "salary_mismatch" }),
      ),
    ).toMatchObject({ outcome: "denied", denied_reason: "salary_mismatch" });
  });

  it("offer sends the salary trio (amount trimmed) and never denied_reason", () => {
    const payload = toFinalizeOutcomePayload(
      closeValues({
        event_type: "offer",
        salary_amount: " 120000 ",
        salary_currency: "SEK",
        salary_period: "annually",
      }),
    );
    expect(payload).toEqual({
      outcome: "offer",
      event_date: "2026-09-10",
      observation: undefined,
      salary_amount: "120000",
      salary_currency: "SEK",
      salary_period: "annually",
    });
    expect(payload).not.toHaveProperty("denied_reason");
  });

  it("blank or whitespace-only notes are sent as undefined", () => {
    expect(
      toFinalizeOutcomePayload(
        closeValues({ event_type: "denied", observation: "   " }),
      ),
    ).toMatchObject({ observation: undefined });
  });

  it("never carries the schedule, interview_type or the close flag", () => {
    const payload = toFinalizeOutcomePayload(
      closeValues({
        event_type: "denied",
        start_time: "09:00",
        end_time: "10:00",
        timezone: "UTC",
        interview_type: "technical",
      }),
    );
    for (const key of [
      "start_time",
      "end_time",
      "timezone",
      "interview_type",
      "close_application",
      "event_type",
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
  });
});
