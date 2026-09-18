import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { TimelineSection } from "@/components/timeline/timeline-section";
import type { Application } from "@/services/types/applications";
import { services } from "@/services/services";
import type { TimelineEvent } from "@/services/types/timeline";

/**
 * PRD 0008 / ADR 0012 (T046):
 *
 * - AC1 (R-013): every event renders its date, start/end time, timezone and
 *   observation.
 * - AC2 (R-014): a legacy hourly offer card shows its amount/currency/period
 *   (`salary_period: "hourly"`, migrated or CLI-written) and a denied card
 *   shows "Denied".
 * - AC8 (R-030): `initial_screening` is `aria-disabled` in the interview type
 *   select once another event already has one, EXCLUDING the event being
 *   edited (editing the screening event itself leaves its own option
 *   enabled); the API's 409 detail reaches the user in a toast.
 */

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({
    selectedCycleId: null,
    setSelectedCycleId: () => {},
    isViewingPastCycle: false,
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock("@/services/services", () => ({
  services: {
    timeline: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

function application(): Application {
  return {
    id: "app-1",
    company_id: "c-1",
    company_name: "Acme",
    platform_id: "p-1",
    role: "Backend engineer",
    mode: "active",
    application_date: "2026-06-01",
    finalized: false,
    finalized_at: null,
  };
}

function renderSection(events: TimelineEvent[]) {
  vi.mocked(services.timeline.list).mockResolvedValue(events);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(<TimelineSection application={application()} />, {
    wrapper: Wrapper,
  });
}

function baseEvent(overrides: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: "e-1",
    application_id: "app-1",
    user_id: "u-1",
    event_type: "note",
    interview_type: null,
    denied_reason: null,
    event_date: "2026-07-03",
    start_time: null,
    end_time: null,
    timezone: null,
    observation: null,
    salary_period: null,
    salary_amount: null,
    salary_currency: null,
    created_at: "2026-07-03T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

describe("TimelineSection — full event rendering (AC1)", () => {
  it("renders date, time range, timezone and observation", async () => {
    const { container } = renderSection([
      baseEvent({
        event_type: "interview",
        interview_type: "technical",
        event_date: "2026-07-03",
        start_time: "10:00",
        end_time: "11:00",
        timezone: "Europe/London",
        observation: "Panel round with the platform team",
      }),
    ]);

    await screen.findByText("Panel round with the platform team");
    expect(screen.getByText(/10:00.*11:00/)).toBeInTheDocument();
    expect(screen.getByText(/Europe\/London/)).toBeInTheDocument();
    // Date is rendered as a <time> element with the machine-readable ISO date.
    const time = container.querySelector("time");
    expect(time).not.toBeNull();
    expect(time).toHaveAttribute("dateTime", "2026-07-03");
    expect(time?.textContent).not.toBe("");
  });
});

describe("TimelineSection — offer and denied cards (AC2)", () => {
  it("shows a legacy hourly offer's amount, currency and period", async () => {
    renderSection([
      baseEvent({
        id: "offer-1",
        event_type: "offer",
        event_date: "2026-06-15",
        salary_period: "hourly",
        salary_amount: "25.50",
        salary_currency: "USD",
      }),
    ]);

    await screen.findByText("Offer");
    expect(screen.getByText(/USD/)).toBeInTheDocument();
    expect(screen.getByText(/25\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\/hr/)).toBeInTheDocument();
  });

  it("shows a denied event's badge, with an Unknown reason by default (KODI-014)", async () => {
    renderSection([baseEvent({ id: "denied-1", event_type: "denied" })]);

    expect(await screen.findByText("Denied")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("shows a denied event's stored reason (KODI-014)", async () => {
    renderSection([
      baseEvent({
        id: "denied-2",
        event_type: "denied",
        denied_reason: "not_good_enough",
      }),
    ]);

    expect(await screen.findByText("Denied")).toBeInTheDocument();
    expect(screen.getByText("Not good enough")).toBeInTheDocument();
  });
});

describe("TimelineSection — R-030 initial-screening dedup, end to end (AC8)", () => {
  // Newest-first render order (event_date descending): NOTE (2026-07-03)
  // renders before SCREENING (2026-06-01).
  const SCREENING: TimelineEvent = baseEvent({
    id: "screening-1",
    event_type: "interview",
    interview_type: "initial_screening",
    event_date: "2026-06-01",
  });
  const NOTE: TimelineEvent = baseEvent({ id: "note-1", event_type: "note" });

  async function openEditDialogFor(
    user: ReturnType<typeof userEvent.setup>,
    index: number,
  ) {
    const menus = await screen.findAllByRole("button", {
      name: /^Event actions: /,
    });
    await user.click(menus[index]);
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
  }

  it("disables initial_screening when adding a NEW interview", async () => {
    const user = userEvent.setup();
    renderSection([SCREENING, NOTE]);
    await screen.findByText("Note", { exact: true });

    await user.click(screen.getByRole("button", { name: "Add event" }));
    await user.click(await screen.findByRole("radio", { name: "Interview" }));
    await user.click(screen.getByRole("combobox", { name: "Interview type" }));
    const option = await screen.findByRole("option", {
      name: /Initial screening/,
    });
    expect(option).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves initial_screening enabled when editing the screening event itself", async () => {
    const user = userEvent.setup();
    renderSection([SCREENING, NOTE]);
    await screen.findByText("Note", { exact: true });

    // index 1: the screening card (NOTE renders first, newest-first).
    await openEditDialogFor(user, 1);

    await user.click(screen.getByRole("combobox", { name: "Interview type" }));
    const option = await screen.findByRole("option", {
      name: /Initial screening/,
    });
    expect(option).not.toHaveAttribute("aria-disabled", "true");
  });

  it("toasts the API's 409 detail when a create is refused", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockRejectedValue(
      Object.assign(new Error("conflict"), {
        isAxiosError: true,
        response: {
          status: 409,
          data: {
            detail:
              "This application already has an initial screening interview; an application can have only one",
          },
        },
      }),
    );
    renderSection([SCREENING, NOTE]);
    await screen.findByText("Note", { exact: true });

    await user.click(screen.getByRole("button", { name: "Add event" }));
    await user.click(await screen.findByRole("button", { name: /add event/i }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "This application already has an initial screening interview; an application can have only one",
      ),
    );
  });
});
