import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { type ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  APPLICATION_CLOSE_COPY,
  FINALIZE_OUTCOME_COPY,
} from "@/components/applications/application-close-copy";

import { TimelineEventForm } from "@/components/timeline/timeline-event-form";
import { TIMELINE_COPY } from "@/components/timeline/timeline-copy";
import { EVENT_TYPE_CONFIG } from "@/components/timeline/timeline-options";
import { type TimelineEventView } from "@/components/timeline/timeline-types";
import {
  browserTimeZone,
  timeZoneLabel,
} from "@/components/timeline/timezone-options";
import { services } from "@/services/services";

/**
 * PRD 0008 / ADR 0012 (T046): the interview type select is shown ONLY for
 * `interview` events (default `unknown`) and hidden for every other type
 * (AC7); `initial_screening` is disabled once the application already has one
 * (AC8/R-030); a legacy hourly offer shows `TIMELINE_COPY.legacyHourlyOffer` and
 * blocks save until monthly/annually is picked.
 */

vi.mock("@/services/services", () => ({
  services: {
    timeline: {
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      list: vi.fn(),
    },
    applications: {
      finalize: vi.fn(),
    },
  },
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
// Every test sets its own `mockResolvedValue`; reset so no test reads a call
// another test made (`mock.calls[0]`, `toHaveBeenCalledWith`).
beforeEach(() => {
  vi.mocked(services.timeline.create).mockReset();
  vi.mocked(services.timeline.update).mockReset();
  vi.mocked(services.applications.finalize).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

const CLOSE_BOX = { name: "Close the application" } as const;

/** Add event with an Offer or Denied closes by default: untick to only add. */
async function untickClose(user: ReturnType<typeof userEvent.setup>) {
  const box = screen.getByRole("checkbox", CLOSE_BOX);
  expect(box).toBeChecked();
  await user.click(box);
  expect(box).not.toBeChecked();
}

function renderForm(
  props: Partial<React.ComponentProps<typeof TimelineEventForm>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(
    <TimelineEventForm
      applicationId="app-1"
      open
      onOpenChange={() => {}}
      event={null}
      otherEvents={[]}
      {...props}
    />,
    { wrapper: Wrapper },
  );
}

describe("TimelineEventForm — interview type visibility (AC7)", () => {
  it("offers exactly Interview, Offer and Denied, and opens on Interview / Unknown (ADR 0020)", () => {
    renderForm();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "interview",
      "offer",
      "denied",
    ]);
    expect(screen.queryByRole("radio", { name: "Note" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Feedback" })).toBeNull();
    // None only closes an application: Add event never offers it.
    expect(screen.queryByRole("radio", { name: "None" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Interview" })).toBeChecked();
    expect(
      screen.getByRole("combobox", { name: "Interview type" }),
    ).toHaveTextContent("Unknown");
  });

  it.each(["Offer", "Denied"])(
    "hides the interview type select for %s",
    async (label) => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("radio", { name: label }));
      expect(
        screen.queryByRole("combobox", { name: "Interview type" }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows the interview type select, defaulted to Unknown, for Interview", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    const select = screen.getByRole("combobox", { name: "Interview type" });
    expect(select).toBeInTheDocument();
    expect(select).toHaveTextContent("Unknown");
  });

  it("saves interview_type 'unknown' when the select is left untouched", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue({
      id: "e-1",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "interview",
      interview_type: "unknown",
      denied_reason: null,
      event_date: "2026-01-01",
      start_time: null,
      end_time: null,
      timezone: null,
      observation: null,
      salary_period: null,
      salary_amount: null,
      salary_currency: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
    });
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    await user.click(screen.getByRole("button", { name: /add event/i }));
    await waitFor(() =>
      expect(services.timeline.create).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          event_type: "interview",
          interview_type: "unknown",
        }),
      ),
    );
  });

  it("saves a new event left completely untouched as an interview of type unknown", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue({
      id: "e-1b",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "interview",
      interview_type: "unknown",
      denied_reason: null,
      event_date: "2026-01-01",
      start_time: null,
      end_time: null,
      timezone: null,
      observation: null,
      salary_period: null,
      salary_amount: null,
      salary_currency: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
    });
    renderForm();
    await user.click(screen.getByRole("button", { name: /add event/i }));
    await waitFor(() =>
      expect(services.timeline.create).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          event_type: "interview",
          interview_type: "unknown",
        }),
      ),
    );
  });
});

describe("TimelineEventForm — R-030 initial screening dedup (AC8)", () => {
  const OTHER_INITIAL_SCREENING: TimelineEventView = {
    id: "other-1",
    type: "interview",
    interviewType: "initial_screening",
    eventDate: "2026-07-01",
  };

  it("shows the taken hint once another event already has initial_screening", async () => {
    const user = userEvent.setup();
    renderForm({ otherEvents: [OTHER_INITIAL_SCREENING] });
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    expect(
      screen.getByText(TIMELINE_COPY.initialScreeningTaken),
    ).toBeInTheDocument();
  });

  it("shows no taken hint when no other event has initial_screening", async () => {
    const user = userEvent.setup();
    renderForm({ otherEvents: [] });
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    expect(
      screen.queryByText(TIMELINE_COPY.initialScreeningTaken),
    ).not.toBeInTheDocument();
  });

  it("excludes the event being edited from the dedup check", async () => {
    const user = userEvent.setup();
    // Editing OTHER_INITIAL_SCREENING itself: it must not disable against itself.
    renderForm({
      event: OTHER_INITIAL_SCREENING,
      otherEvents: [], // caller (TimelineSection) filters the edited event out
    });
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    expect(
      screen.queryByText(TIMELINE_COPY.initialScreeningTaken),
    ).not.toBeInTheDocument();
  });
});

describe("TimelineEventForm — legacy hourly offer (R-031 WATCH)", () => {
  const LEGACY_OFFER: TimelineEventView = {
    id: "offer-1",
    type: "offer",
    eventDate: "2026-06-01",
    salaryPeriod: "hourly",
    salaryAmount: "25.50",
    salaryCurrency: "USD",
  };

  it("shows the legacy hourly hint and no period pre-selected when editing", async () => {
    renderForm({ event: LEGACY_OFFER, otherEvents: [] });
    expect(
      screen.getByText(TIMELINE_COPY.legacyHourlyOffer),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Monthly", checked: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Annually", checked: true }),
    ).not.toBeInTheDocument();
  });

  it("blocks save until monthly or annually is picked", async () => {
    const user = userEvent.setup();
    renderForm({ event: LEGACY_OFFER, otherEvents: [] });
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(services.timeline.update).not.toHaveBeenCalled(),
    );
  });
});

describe("TimelineEventForm — schedule visibility (AC2, KODI-014)", () => {
  it("shows the schedule inputs by default (a new event is an interview)", () => {
    renderForm();
    expect(screen.getByLabelText("Start")).toBeInTheDocument();
    expect(screen.getByLabelText("End")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Timezone" }),
    ).toBeInTheDocument();
  });

  it("shows the schedule inputs for Interview", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    expect(screen.getByLabelText("Start")).toBeInTheDocument();
    expect(screen.getByLabelText("End")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Timezone" }),
    ).toBeInTheDocument();
  });

  it.each(["Offer", "Denied"])(
    "hides the schedule inputs for %s",
    async (label) => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("radio", { name: label }));
      expect(screen.queryByLabelText("Start")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("End")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("combobox", { name: "Timezone" }),
      ).not.toBeInTheDocument();
    },
  );

  it("omits the schedule from the payload after switching away from Interview (AC2/AC3, KODI-014/KODI-016)", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue({
      id: "e-2",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "denied",
      interview_type: null,
      denied_reason: null,
      event_date: "2026-01-01",
      start_time: null,
      end_time: null,
      timezone: null,
      observation: null,
      salary_period: null,
      salary_amount: null,
      salary_currency: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
    });
    renderForm();

    // Fill the schedule while Interview is selected…
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    await user.type(screen.getByLabelText("Start"), "09:00");
    await user.type(screen.getByLabelText("End"), "10:00");

    // …then switch away. The inputs unmount and the stale values must never
    // reach the API.
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await untickClose(user);
    await user.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(services.timeline.create).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          event_type: "denied",
        }),
      ),
    );
    const [, createdPayload] = vi.mocked(services.timeline.create).mock
      .calls[0];
    expect(createdPayload).not.toHaveProperty("start_time");
    expect(createdPayload).not.toHaveProperty("end_time");
    expect(createdPayload).not.toHaveProperty("timezone");
  });
});

describe("TimelineEventForm — a non-interview event never sends a schedule (KODI-016)", () => {
  const STORED_DENIED_WITH_LEGACY_SCHEDULE: TimelineEventView = {
    id: "denied-1",
    type: "denied",
    deniedReason: "unknown",
    eventDate: "2026-06-01",
    startTime: "09:00",
    endTime: "10:00",
    timezone: "Europe/London",
    observation: "Old note",
  };

  function mockUpdatedEvent() {
    vi.mocked(services.timeline.update).mockResolvedValue({
      id: "denied-1",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "denied",
      interview_type: null,
      denied_reason: null,
      event_date: "2026-06-01",
      observation: "Updated note",
      salary_period: null,
      salary_amount: null,
      salary_currency: null,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-02T00:00:00Z",
    });
  }

  it("sends no schedule in the PUT when editing a stored non-interview event that already carries a legacy schedule, even when only the observation changes", async () => {
    const user = userEvent.setup();
    mockUpdatedEvent();
    renderForm({ event: STORED_DENIED_WITH_LEGACY_SCHEDULE, otherEvents: [] });

    // The schedule inputs stay hidden — Denied is not Interview.
    expect(screen.queryByLabelText("Start")).not.toBeInTheDocument();

    const notes = screen.getByLabelText("Notes (optional)");
    await user.clear(notes);
    await user.type(notes, "Updated note");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(services.timeline.update).toHaveBeenCalledWith(
        "app-1",
        "denied-1",
        expect.objectContaining({
          event_type: "denied",
          observation: "Updated note",
        }),
      ),
    );
    const [, , updatedPayload] = vi.mocked(services.timeline.update).mock
      .calls[0];
    expect(updatedPayload).not.toHaveProperty("start_time");
    expect(updatedPayload).not.toHaveProperty("end_time");
    expect(updatedPayload).not.toHaveProperty("timezone");
  });

  it("sends no schedule when a briefly-Interview detour ends back on a non-interview type", async () => {
    const user = userEvent.setup();
    mockUpdatedEvent();
    renderForm({ event: STORED_DENIED_WITH_LEGACY_SCHEDULE, otherEvents: [] });

    // Toggle to Interview, type times, then switch back to Denied.
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    await user.clear(screen.getByLabelText("Start"));
    await user.type(screen.getByLabelText("Start"), "14:00");
    await user.clear(screen.getByLabelText("End"));
    await user.type(screen.getByLabelText("End"), "15:00");
    await user.click(screen.getByRole("radio", { name: "Denied" }));

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(services.timeline.update).toHaveBeenCalledWith(
        "app-1",
        "denied-1",
        expect.objectContaining({ event_type: "denied" }),
      ),
    );
    const [, , updatedPayload] = vi.mocked(services.timeline.update).mock
      .calls[0];
    expect(updatedPayload).not.toHaveProperty("start_time");
    expect(updatedPayload).not.toHaveProperty("end_time");
    expect(updatedPayload).not.toHaveProperty("timezone");
  });

  it("sends no schedule when the edit switches the type FROM Interview TO a non-interview type", async () => {
    const user = userEvent.setup();
    const STORED_INTERVIEW: TimelineEventView = {
      id: "interview-2",
      type: "interview",
      interviewType: "technical",
      eventDate: "2026-06-01",
      startTime: "09:00",
      endTime: "10:00",
      timezone: "Europe/London",
      observation: null,
    };
    vi.mocked(services.timeline.update).mockResolvedValue({
      id: "interview-2",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "denied",
      interview_type: null,
      denied_reason: null,
      event_date: "2026-06-01",
      observation: null,
      salary_period: null,
      salary_amount: null,
      salary_currency: null,
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-02T00:00:00Z",
    });
    renderForm({ event: STORED_INTERVIEW, otherEvents: [] });

    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(services.timeline.update).toHaveBeenCalledWith(
        "app-1",
        "interview-2",
        expect.objectContaining({ event_type: "denied" }),
      ),
    );
    const [, , updatedPayload] = vi.mocked(services.timeline.update).mock
      .calls[0];
    expect(updatedPayload).not.toHaveProperty("start_time");
    expect(updatedPayload).not.toHaveProperty("end_time");
    expect(updatedPayload).not.toHaveProperty("timezone");
  });
});

describe("TimelineEventForm — timezone (AC3, KODI-014)", () => {
  it("pre-fills the timezone select with the browser's own zone for a new interview", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    const trigger = screen.getByRole("combobox", { name: "Timezone" });
    expect(trigger).toHaveTextContent(timeZoneLabel(browserTimeZone()));
  });

  it("the stored timezone wins on edit, even one the browser does not list", async () => {
    const EVENT: TimelineEventView = {
      id: "interview-1",
      type: "interview",
      eventDate: "2026-06-01",
      timezone: "Legacy/Not_A_Real_Zone",
    };
    renderForm({ event: EVENT, otherEvents: [] });
    const trigger = screen.getByRole("combobox", { name: "Timezone" });
    expect(trigger).toHaveTextContent("Legacy/Not A Real Zone");

    // Opening the list still finds and checks it, in its own "Selected" group
    // — a stored zone the browser does not offer is not silently dropped.
    const user = userEvent.setup();
    await user.click(trigger);
    const option = await screen.findByRole("option", {
      name: /Legacy\/Not A Real Zone/,
    });
    expect(option).toHaveAttribute("data-checked", "true");
  });
});

describe("TimelineEventForm — denied reason (AC4, KODI-014)", () => {
  it("hides the reason select by default (interview)", () => {
    renderForm();
    expect(
      screen.queryByRole("combobox", { name: "Reason" }),
    ).not.toBeInTheDocument();
  });

  it("shows the reason select, defaulted to Unknown, for Denied", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    const select = screen.getByRole("combobox", { name: "Reason" });
    expect(select).toBeInTheDocument();
    expect(select).toHaveTextContent("Unknown");
  });

  it("sends denied_reason 'unknown' when the select is left untouched", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue({
      id: "e-3",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "denied",
      interview_type: null,
      denied_reason: "unknown",
      event_date: "2026-01-01",
      start_time: null,
      end_time: null,
      timezone: null,
      observation: null,
      salary_period: null,
      salary_amount: null,
      salary_currency: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
    });
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await untickClose(user);
    await user.click(screen.getByRole("button", { name: /add event/i }));
    await waitFor(() =>
      expect(services.timeline.create).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          event_type: "denied",
          denied_reason: "unknown",
        }),
      ),
    );
  });

  it("sends the picked reason for a denied event", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue({
      id: "e-4",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "denied",
      interview_type: null,
      denied_reason: "ghosted",
      event_date: "2026-01-01",
      start_time: null,
      end_time: null,
      timezone: null,
      observation: null,
      salary_period: null,
      salary_amount: null,
      salary_currency: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
    });
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("combobox", { name: "Reason" }));
    await user.click(await screen.findByRole("option", { name: "Ghosted" }));
    await untickClose(user);
    await user.click(screen.getByRole("button", { name: /add event/i }));
    await waitFor(() =>
      expect(services.timeline.create).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          event_type: "denied",
          denied_reason: "ghosted",
        }),
      ),
    );
  });

  it.each(["Interview", "Offer"])(
    "never sends denied_reason for %s",
    async (label) => {
      const user = userEvent.setup();
      vi.mocked(services.timeline.create).mockResolvedValue({
        id: "e-5",
        application_id: "app-1",
        user_id: "u-1",
        event_type: "denied",
        interview_type: null,
        denied_reason: null,
        event_date: "2026-01-01",
        start_time: null,
        end_time: null,
        timezone: null,
        observation: null,
        salary_period: null,
        salary_amount: null,
        salary_currency: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: null,
      });
      renderForm();
      await user.click(screen.getByRole("radio", { name: label }));

      if (label === "Offer") {
        await user.click(screen.getByRole("radio", { name: "Monthly" }));
        await user.type(screen.getByLabelText("Amount"), "1000");
        await user.click(screen.getByRole("combobox", { name: "Currency" }));
        await user.click((await screen.findAllByRole("option"))[0]);
        await untickClose(user);
      }

      const submitLabel = /add event/i;
      await user.click(screen.getByRole("button", { name: submitLabel }));
      await waitFor(() =>
        expect(services.timeline.create).toHaveBeenCalledTimes(1),
      );
      const [, payload] = vi.mocked(services.timeline.create).mock.calls[0];
      expect(payload).not.toHaveProperty("denied_reason");
    },
  );
});

// ---------------------------------------------------------------------------
// Close mode: the flag's dialog (`purpose="close"`). The old close dialog's
// cases, every describe of it, ported here: reversible copy, outcome-gated
// fields, server-limit parity, outcome date and the denied reason.
// ---------------------------------------------------------------------------

const RENDER_CLOSE = { purpose: "close" as const };

function todayLocalIso() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function closedApplication() {
  return { id: "app-1" } as never;
}

describe("TimelineEventForm close mode — the choices", () => {
  it("is the Close application dialog, offering None, Offer and Denied in that order, never Interview", () => {
    renderForm(RENDER_CLOSE);
    expect(
      screen.getByRole("dialog", { name: "Close application" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Outcome" })).toBeVisible();
    const radios = screen.getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("value"))).toEqual([
      "none",
      "offer",
      "denied",
    ]);
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "None",
      "Offer",
      "Denied",
    ]);
    expect(screen.queryByRole("radio", { name: "Interview" })).toBeNull();
  });

  it("opens on None, with no checkbox and the Close application button", () => {
    renderForm(RENDER_CLOSE);
    expect(screen.getByRole("radio", { name: "None" })).toBeChecked();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Close application" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add event/i }),
    ).not.toBeInTheDocument();
  });

  it("opens on None again after it was closed on another choice", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    expect(screen.getByRole("radio", { name: "Denied" })).toBeChecked();

    const props = {
      applicationId: "app-1",
      onOpenChange: () => {},
      otherEvents: [],
      purpose: "close" as const,
    };
    rerender(<TimelineEventForm {...props} open={false} />);
    rerender(<TimelineEventForm {...props} open />);
    expect(screen.getByRole("radio", { name: "None" })).toBeChecked();
  });

  it("explains the picked choice under the chips, as the group's description", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    const group = screen.getByRole("radiogroup", { name: "Outcome" });
    expect(group).toHaveAccessibleDescription(
      FINALIZE_OUTCOME_COPY.none.description,
    );
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    expect(group).toHaveAccessibleDescription(
      FINALIZE_OUTCOME_COPY.offer.description,
    );
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    expect(group).toHaveAccessibleDescription(
      FINALIZE_OUTCOME_COPY.denied.description,
    );
  });

  it("Add event shows no explanation line under its chips", () => {
    renderForm();
    expect(
      screen.queryByText(FINALIZE_OUTCOME_COPY.none.description),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Event type" }),
    ).not.toHaveAccessibleDescription(/close/i);
    for (const option of Object.values(EVENT_TYPE_CONFIG)) {
      expect(screen.queryByText(option.hint)).not.toBeInTheDocument();
    }
  });

  it("labels the chips Outcome in close mode and Event type in Add event", () => {
    const view = renderForm(RENDER_CLOSE);
    expect(screen.getByText("Outcome")).toBeInTheDocument();
    expect(screen.queryByText("Event type")).not.toBeInTheDocument();
    view.unmount();
    renderForm();
    expect(screen.getByText("Event type")).toBeInTheDocument();
    expect(screen.queryByText("Outcome")).not.toBeInTheDocument();
  });
});

describe("TimelineEventForm close mode — reversible copy", () => {
  it("always says closing is reversible, as the dialog's description", () => {
    renderForm(RENDER_CLOSE);
    expect(
      screen.getByText(APPLICATION_CLOSE_COPY.reversible),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Close application" }),
    ).toHaveAccessibleDescription(/reversible/i);
  });
});

describe("TimelineEventForm close mode — outcome-gated fields", () => {
  it("None shows no date, notes, salary or reason field", () => {
    renderForm(RENDER_CLOSE);
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Reason" }),
    ).not.toBeInTheDocument();
  });

  it("Denied reveals date + notes but no salary triad", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Currency" }),
    ).not.toBeInTheDocument();
  });

  it("Denied reveals the reason select, defaulted to Unknown", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    const select = screen.getByRole("combobox", { name: "Reason" });
    expect(select).toBeInTheDocument();
    expect(select).toHaveTextContent("Unknown");
  });

  it("None and Offer show no reason select", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    expect(
      screen.queryByRole("combobox", { name: "Reason" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    expect(
      screen.queryByRole("combobox", { name: "Reason" }),
    ).not.toBeInTheDocument();
  });

  it("Offer reveals date, notes and the full salary triad, monthly|annually only", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    expect(screen.getByLabelText("Date")).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Currency" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Annually" })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Hourly" }),
    ).not.toBeInTheDocument();
  });

  it("Offer's currency select lists all 20 currencies", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    expect(screen.getAllByRole("option")).toHaveLength(20);
  });

  it("Offer and Denied ask for the same fields as Add event does", async () => {
    const user = userEvent.setup();
    const fieldsOf = () =>
      ["Date", "Amount"]
        .filter((label) => screen.queryByLabelText(label))
        .concat(
          screen.queryByLabelText(/notes/i) ? ["Notes"] : [],
          screen.queryByRole("combobox", { name: "Currency" })
            ? ["Currency"]
            : [],
          screen.queryByRole("radio", { name: "Monthly" }) ? ["Period"] : [],
          screen.queryByRole("combobox", { name: "Reason" }) ? ["Reason"] : [],
        );

    const seen: Record<string, string[]> = {};
    for (const purpose of ["event", "close"] as const) {
      const view = renderForm({ purpose });
      for (const label of ["Offer", "Denied"]) {
        await user.click(screen.getByRole("radio", { name: label }));
        seen[`${purpose}:${label}`] = fieldsOf();
      }
      view.unmount();
    }
    expect(seen["close:Offer"]).toEqual(seen["event:Offer"]);
    expect(seen["close:Denied"]).toEqual(seen["event:Denied"]);
    expect(seen["close:Offer"]).toEqual([
      "Date",
      "Amount",
      "Notes",
      "Currency",
      "Period",
    ]);
    expect(seen["close:Denied"]).toEqual(["Date", "Notes", "Reason"]);
  });
});

describe("TimelineEventForm close mode — server-limit parity (mirrors FinalizeWithOutcome)", () => {
  it("blocks the close on an amount with more than 2 decimal places", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.type(screen.getByLabelText("Amount"), "100.555");
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(screen.getAllByRole("option")[0]);
    await user.click(screen.getByRole("radio", { name: "Monthly" }));

    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Please fix the highlighted fields before closing",
      ),
    );
    expect(services.applications.finalize).not.toHaveBeenCalled();
    expect(
      screen.getByText("Up to 10 digits and 2 decimal places"),
    ).toBeInTheDocument();
  });

  it("blocks the close on notes longer than 5000 characters", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "a".repeat(5001) },
    });

    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(services.applications.finalize).not.toHaveBeenCalled();
    expect(screen.getByText("Notes are too long")).toBeInTheDocument();
  });

  it("a stale over-limit note left over from Denied does not block a None close", async () => {
    // None unmounts the notes field: a value typed while Denied was picked
    // must not block the close once switched back to None, since nothing
    // left on screen could fix it.
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "a".repeat(5001) },
    });
    await user.click(screen.getByRole("radio", { name: "None" }));

    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        undefined,
      ),
    );
  });
});

describe("TimelineEventForm close mode — outcome date", () => {
  // Mid-month, so tomorrow is always on the calendar that opens. Only `Date`
  // is faked: user-event and Radix keep their real timers.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function calendarDay(day: number) {
    return screen
      .getAllByRole("button")
      .find((b) => b.closest('[role="grid"]') && b.textContent === String(day));
  }

  it("defaults the date to today and disables tomorrow", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    const trigger = screen.getByLabelText("Date");
    expect(trigger).toHaveTextContent("2026-10-15");

    await user.click(trigger);
    expect(calendarDay(15)).not.toBeDisabled();
    expect(calendarDay(16)).toBeDisabled();
  });

  it("Offer caps the date at today too", async () => {
    const user = userEvent.setup();
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.click(screen.getByLabelText("Date"));
    expect(calendarDay(16)).toBeDisabled();
  });

  it.each(["Offer", "Denied"])(
    "Add event with %s caps the date at today while the box is ticked",
    async (label) => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("radio", { name: label }));
      await user.click(screen.getByLabelText("Date"));
      expect(calendarDay(15)).not.toBeDisabled();
      expect(calendarDay(16)).toBeDisabled();
    },
  );

  it("Add event with the box unticked (no close) still allows a future date", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await untickClose(user);
    await user.click(screen.getByLabelText("Date"));
    expect(calendarDay(16)).not.toBeDisabled();
  });

  it("Add event with an Interview never caps the date", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByLabelText("Date"));
    expect(calendarDay(16)).not.toBeDisabled();
  });
});

describe("TimelineEventForm close mode — saving", () => {
  it("None closes with a bodyless finalize and adds nothing to the timeline", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm({ ...RENDER_CLOSE, onOpenChange });
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        undefined,
      ),
    );
    expect(services.applications.finalize).toHaveBeenCalledTimes(1);
    expect(services.timeline.create).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Application closed");
  });

  it("Offer sends the outcome body with the salary trio, in one finalize call", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.click(screen.getByRole("radio", { name: "Annually" }));
    await user.type(screen.getByLabelText("Amount"), " 120000 ");
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click(await screen.findByRole("option", { name: "SEK" }));
    await user.type(screen.getByLabelText(/notes/i), "  Verbal offer  ");
    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledTimes(1),
    );
    expect(services.applications.finalize).toHaveBeenCalledWith("app-1", {
      outcome: "offer",
      event_date: todayLocalIso(),
      observation: "Verbal offer",
      salary_amount: "120000",
      salary_currency: "SEK",
      salary_period: "annually",
    });
    expect(services.timeline.create).not.toHaveBeenCalled();
  });

  it("sends denied_reason 'unknown' when the select is left untouched", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith("app-1", {
        outcome: "denied",
        event_date: todayLocalIso(),
        observation: undefined,
        denied_reason: "unknown",
      }),
    );
    expect(services.timeline.create).not.toHaveBeenCalled();
  });

  it("sends the picked reason", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("combobox", { name: "Reason" }));
    await user.click(
      await screen.findByRole("option", { name: "Salary mismatch" }),
    );
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          outcome: "denied",
          denied_reason: "salary_mismatch",
        }),
      ),
    );
  });

  it("never sends denied_reason for an Offer close", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await user.click(screen.getByRole("radio", { name: "Monthly" }));
    await user.type(screen.getByLabelText("Amount"), "1000");
    await user.click(screen.getByRole("combobox", { name: "Currency" }));
    await user.click((await screen.findAllByRole("option"))[0]);
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalled(),
    );
    const [, payload] = vi.mocked(services.applications.finalize).mock.calls[0];
    expect(payload).not.toHaveProperty("denied_reason");
  });

  it("a None close after visiting Denied sends no body, and no denied_reason", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("radio", { name: "None" }));
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledWith(
        "app-1",
        undefined,
      ),
    );
  });

  it("a refused close (409: already closed) shows the server's words and keeps the dialog open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const detail = "Reopen the application to edit it (it is currently closed)";
    vi.mocked(services.applications.finalize).mockRejectedValue(
      new AxiosError("Conflict", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        statusText: "Conflict",
        headers: new AxiosHeaders(),
        config: {} as never,
        data: { detail },
      }),
    );
    renderForm({ ...RENDER_CLOSE, onOpenChange });
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("button", { name: "Close application" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(detail));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Close application" }),
    ).toBeInTheDocument();
  });

  it("locks the dialog while closing: buttons disabled, the label kept, no second request", async () => {
    const user = userEvent.setup();
    let resolve: (value: never) => void = () => {};
    vi.mocked(services.applications.finalize).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderForm(RENDER_CLOSE);
    const submit = screen.getByRole("button", { name: "Close application" });
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveTextContent("Close application");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.click(submit);
    expect(services.applications.finalize).toHaveBeenCalledTimes(1);
    resolve(closedApplication());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Application closed"),
    );
  });

  it("a failure with no server answer falls back to 'Could not close it'", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockRejectedValue(
      new Error("boom"),
    );
    renderForm(RENDER_CLOSE);
    await user.click(screen.getByRole("button", { name: "Close application" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not close it"),
    );
  });
});

// ---------------------------------------------------------------------------
// Add event: the "Close the application" box (PRD 0016). Shown only for an
// Offer or Denied being added, ticked on every open; ticked, the save is ONE
// finalize request with the outcome body, never a create.
// ---------------------------------------------------------------------------

const STORED_OFFER: TimelineEventView = {
  id: "offer-1",
  type: "offer",
  eventDate: "2026-06-01",
  startTime: null,
  endTime: null,
  timezone: null,
  observation: null,
  salaryPeriod: "monthly",
  salaryAmount: "9000",
  salaryCurrency: "EUR",
};

const STORED_DENIED: TimelineEventView = {
  id: "denied-2",
  type: "denied",
  deniedReason: "ghosted",
  eventDate: "2026-06-01",
  startTime: null,
  endTime: null,
  timezone: null,
  observation: null,
};

function storedEventResponse(type: "offer" | "denied") {
  return {
    id: "e-9",
    application_id: "app-1",
    user_id: "u-1",
    event_type: type,
    interview_type: null,
    denied_reason: type === "denied" ? "unknown" : null,
    event_date: "2026-01-01",
    observation: null,
    salary_period: type === "offer" ? "monthly" : null,
    salary_amount: type === "offer" ? "9000" : null,
    salary_currency: type === "offer" ? "EUR" : null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  } as const;
}

async function fillOffer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("radio", { name: "Offer" }));
  await user.click(screen.getByRole("radio", { name: "Monthly" }));
  await user.type(screen.getByLabelText("Amount"), "9000");
  await user.click(screen.getByRole("combobox", { name: "Currency" }));
  await user.click(await screen.findByRole("option", { name: "EUR" }));
}

describe("TimelineEventForm Add event — the close box", () => {
  it.each(["Offer", "Denied"])(
    "shows the box for %s, ticked, named and described, before Cancel",
    async (label) => {
      const user = userEvent.setup();
      renderForm();
      await user.click(screen.getByRole("radio", { name: label }));
      const box = screen.getByRole("checkbox", CLOSE_BOX);
      expect(box).toBeChecked();
      expect(box).toHaveAccessibleName("Close the application");
      expect(box).toHaveAccessibleDescription("You can reopen it later.");
      // Footer order: the box, then Cancel, then the submit.
      const cancel = screen.getByRole("button", { name: "Cancel" });
      const submit = screen.getByRole("button", { name: /add event/i });
      expect(
        box.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        cancel.compareDocumentPosition(submit) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(submit).toHaveTextContent("Add event");
    },
  );

  it("shows no box for Interview, the type Add event opens on", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: "Interview" })).toBeChecked();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it.each([
    ["an Offer", STORED_OFFER],
    ["a Denied", STORED_DENIED],
  ])("shows no box when editing %s event", (_label, event) => {
    renderForm({ event });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it.each(["Offer", "Denied"])(
    "shows no box in the close dialog with %s picked",
    async (label) => {
      const user = userEvent.setup();
      renderForm(RENDER_CLOSE);
      await user.click(screen.getByRole("radio", { name: label }));
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    },
  );

  it("is ticked again when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await untickClose(user);

    const props = {
      applicationId: "app-1",
      onOpenChange: () => {},
      otherEvents: [],
      event: null,
    };
    rerender(<TimelineEventForm {...props} open={false} />);
    rerender(<TimelineEventForm {...props} open />);
    // Reopened on Interview: no box until an Offer or Denied is picked.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    expect(screen.getByRole("checkbox", CLOSE_BOX)).toBeChecked();
  });

  it("keeps the choice while the dialog stays open: Offer, untick, Interview, Offer", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    await untickClose(user);
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Offer" }));
    expect(screen.getByRole("checkbox", CLOSE_BOX)).not.toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    expect(screen.getByRole("checkbox", CLOSE_BOX)).not.toBeChecked();
  });
});

describe("TimelineEventForm Add event — saving with the close box", () => {
  it("Offer, ticked: one finalize with the salary trio, never a create", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm({ onOpenChange });
    await fillOffer(user);
    await user.type(screen.getByLabelText(/notes/i), " Signed ");
    await user.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledTimes(1),
    );
    expect(services.applications.finalize).toHaveBeenCalledWith("app-1", {
      outcome: "offer",
      event_date: todayLocalIso(),
      observation: "Signed",
      salary_amount: "9000",
      salary_currency: "EUR",
      salary_period: "monthly",
    });
    expect(services.timeline.create).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Application closed");
  });

  it("Denied, ticked: one finalize with the reason, never a create", async () => {
    const user = userEvent.setup();
    vi.mocked(services.applications.finalize).mockResolvedValue(
      closedApplication(),
    );
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("combobox", { name: "Reason" }));
    await user.click(await screen.findByRole("option", { name: "Ghosted" }));
    await user.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(services.applications.finalize).toHaveBeenCalledTimes(1),
    );
    expect(services.applications.finalize).toHaveBeenCalledWith("app-1", {
      outcome: "denied",
      event_date: todayLocalIso(),
      observation: undefined,
      denied_reason: "ghosted",
    });
    expect(services.timeline.create).not.toHaveBeenCalled();
  });

  it.each(["offer", "denied"] as const)(
    "%s, unticked: a create, never a finalize; the toast says Event added",
    async (type) => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      vi.mocked(services.timeline.create).mockResolvedValue(
        storedEventResponse(type) as never,
      );
      renderForm({ onOpenChange });
      if (type === "offer") await fillOffer(user);
      else await user.click(screen.getByRole("radio", { name: "Denied" }));
      await untickClose(user);
      await user.click(screen.getByRole("button", { name: /add event/i }));

      await waitFor(() =>
        expect(services.timeline.create).toHaveBeenCalledWith(
          "app-1",
          expect.objectContaining({ event_type: type }),
        ),
      );
      expect(services.timeline.create).toHaveBeenCalledTimes(1);
      expect(services.applications.finalize).not.toHaveBeenCalled();
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(toast.success).toHaveBeenCalledWith("Event added");
    },
  );

  it("a refused finalize (422) shows the server's words and keeps the dialog open", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const detail = "Event date cannot be in the future";
    vi.mocked(services.applications.finalize).mockRejectedValue(
      new AxiosError("Unprocessable", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 422,
        statusText: "Unprocessable Entity",
        headers: new AxiosHeaders(),
        config: {} as never,
        data: { detail },
      }),
    );
    renderForm({ onOpenChange });
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await user.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(detail));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(services.timeline.create).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Add event" }),
    ).toBeInTheDocument();
  });

  it("locks the box, Cancel and Add event while the finalize is in flight", async () => {
    const user = userEvent.setup();
    let resolve: (value: never) => void = () => {};
    vi.mocked(services.applications.finalize).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    const submit = screen.getByRole("button", { name: /add event/i });
    await user.click(submit);
    await waitFor(() =>
      expect(screen.getByRole("checkbox", CLOSE_BOX)).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(services.applications.finalize).toHaveBeenCalledTimes(1);
    resolve(closedApplication());
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Application closed"),
    );
  });

  it.each([
    ["an Offer", STORED_OFFER],
    ["a Denied", STORED_DENIED],
  ])("editing %s event updates it and never finalizes", async (_l, event) => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.update).mockResolvedValue(
      storedEventResponse(event.type as "offer" | "denied") as never,
    );
    renderForm({ event });
    await user.type(screen.getByLabelText(/notes/i), "Edited");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(services.timeline.update).toHaveBeenCalledWith(
        "app-1",
        event.id,
        expect.objectContaining({
          event_type: event.type,
          observation: "Edited",
        }),
      ),
    );
    expect(services.applications.finalize).not.toHaveBeenCalled();
    expect(services.timeline.create).not.toHaveBeenCalled();
  });
});

describe("TimelineEventForm Add event — the date when the box closes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function calendarDay(day: number) {
    return screen
      .getAllByRole("button")
      .find((b) => b.closest('[role="grid"]') && b.textContent === String(day));
  }

  it("a future date picked unticked, then ticked: the closing error, nothing sent", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await untickClose(user);
    await user.click(screen.getByLabelText("Date"));
    await user.click(calendarDay(20)!);
    await waitFor(() =>
      expect(screen.getByLabelText("Date")).toHaveTextContent("2026-10-20"),
    );

    await user.click(screen.getByRole("checkbox", CLOSE_BOX));
    expect(screen.getByRole("checkbox", CLOSE_BOX)).toBeChecked();
    await user.click(screen.getByRole("button", { name: /add event/i }));

    expect(
      await screen.findByText(
        "Pick today or an earlier date to close the application",
      ),
    ).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith(
      "Please fix the highlighted fields before closing",
    );
    expect(services.applications.finalize).not.toHaveBeenCalled();
    expect(services.timeline.create).not.toHaveBeenCalled();
  });

  it("unticking lifts the cap: the same future date then saves as a create", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue(
      storedEventResponse("denied") as never,
    );
    renderForm();
    await user.click(screen.getByRole("radio", { name: "Denied" }));
    await untickClose(user);
    await user.click(screen.getByLabelText("Date"));
    await user.click(calendarDay(20)!);
    await user.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(services.timeline.create).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          event_type: "denied",
          event_date: "2026-10-20",
        }),
      ),
    );
    expect(services.applications.finalize).not.toHaveBeenCalled();
  });
});
