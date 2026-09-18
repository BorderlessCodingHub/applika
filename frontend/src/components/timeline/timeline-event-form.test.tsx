import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TimelineEventForm } from "@/components/timeline/timeline-event-form";
import {
  INITIAL_SCREENING_TAKEN_HINT,
  LEGACY_HOURLY_OFFER_HINT,
} from "@/components/timeline/timeline-copy";
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
 * (AC8/R-030); a legacy hourly offer shows `LEGACY_HOURLY_OFFER_HINT` and
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
  },
}));

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
  it("hides the interview type select by default (note)", () => {
    renderForm();
    expect(
      screen.queryByRole("combobox", { name: "Interview type" }),
    ).not.toBeInTheDocument();
  });

  it.each(["Note", "Feedback", "Offer", "Denied"])(
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
    expect(screen.getByText(INITIAL_SCREENING_TAKEN_HINT)).toBeInTheDocument();
  });

  it("shows no taken hint when no other event has initial_screening", async () => {
    const user = userEvent.setup();
    renderForm({ otherEvents: [] });
    await user.click(screen.getByRole("radio", { name: "Interview" }));
    expect(
      screen.queryByText(INITIAL_SCREENING_TAKEN_HINT),
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
      screen.queryByText(INITIAL_SCREENING_TAKEN_HINT),
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
    expect(screen.getByText(LEGACY_HOURLY_OFFER_HINT)).toBeInTheDocument();
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
  it("hides the schedule inputs by default (note)", () => {
    renderForm();
    expect(screen.queryByLabelText("Start")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Timezone" }),
    ).not.toBeInTheDocument();
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

  it.each(["Note", "Feedback", "Offer", "Denied"])(
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

  it("clears the schedule from the payload after switching away from Interview (AC2/AC3, KODI-014)", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue({
      id: "e-2",
      application_id: "app-1",
      user_id: "u-1",
      event_type: "note",
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
    await user.click(screen.getByRole("radio", { name: "Note" }));
    await user.click(screen.getByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(services.timeline.create).toHaveBeenCalledWith(
        "app-1",
        expect.objectContaining({
          event_type: "note",
          start_time: null,
          end_time: null,
          timezone: null,
        }),
      ),
    );
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
  it("hides the reason select by default (note)", () => {
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

  it.each(["Note", "Feedback", "Interview", "Offer"])(
    "never sends denied_reason for %s",
    async (label) => {
      const user = userEvent.setup();
      vi.mocked(services.timeline.create).mockResolvedValue({
        id: "e-5",
        application_id: "app-1",
        user_id: "u-1",
        event_type: "note",
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
      }

      const submitLabel = /add event/i;
      await user.click(screen.getByRole("button", { name: submitLabel }));
      await waitFor(() => expect(services.timeline.create).toHaveBeenCalled());
      const [, payload] = vi.mocked(services.timeline.create).mock.calls[0];
      expect(payload).not.toHaveProperty("denied_reason");
    },
  );
});
