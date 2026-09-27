import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { AgendaPage } from "@/app/(protected)/agenda/agenda-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AgendaStep } from "@/services/types/applications";

const useAgendaMock = vi.fn();
vi.mock("@/hooks/use-user", () => ({
  useAgenda: (...args: unknown[]) => useAgendaMock(...args),
}));

const toggleMock = vi.fn();
const isEnabledMock = vi.fn(() => false);
vi.mock("@/contexts/agenda-notifications-context", () => ({
  useAgendaNotifications: () => ({
    toggle: toggleMock,
    isEnabled: isEnabledMock,
  }),
}));

const genAgendaStepIcsFileMock = vi.fn();
vi.mock("@/lib/calendar", () => ({
  genAgendaStepIcsFile: (...args: unknown[]) =>
    genAgendaStepIcsFileMock(...args),
}));

const toastSuccessMock = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccessMock(...args) },
}));

function step(overrides: Partial<AgendaStep> = {}): AgendaStep {
  return {
    id: "1",
    step_date: "2026-09-18",
    event_type: "interview",
    interview_type: "technical",
    application_id: "app-1",
    company_name: "Acme",
    role: "Backend Engineer",
    ...overrides,
  };
}

function renderPage() {
  return render(
    <TooltipProvider>
      <AgendaPage />
    </TooltipProvider>,
  );
}

// Fixed "now" so a case built against 2026-09-18 never drifts with the real
// clock (the suite otherwise runs on whatever day CI happens to be).
const FIXED_NOW = new Date("2026-09-18T08:00:00");

// A step zone guaranteed to differ from whatever zone the test runner's host
// resolves to (`getDisplayTime`'s default `localTz`), so "converted" is
// reliably true regardless of where this suite runs.
const OTHER_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Tokyo"
    ? "Europe/London"
    : "Asia/Tokyo";

beforeEach(() => {
  vi.clearAllMocks();
  isEnabledMock.mockReturnValue(false);
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgendaPage", () => {
  it("shows Upcoming selected by default, before Past", async () => {
    useAgendaMock.mockReturnValue({
      data: [
        step({ id: "u1", step_date: "2026-09-20", start_time: "10:00:00" }),
        step({
          id: "p1",
          step_date: "2026-09-10",
          start_time: "10:00:00",
          company_name: "Globex",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    const upcomingTab = screen.getByRole("tab", { name: /upcoming \(1\)/i });
    const pastTab = screen.getByRole("tab", { name: /past \(1\)/i });
    expect(upcomingTab).toHaveAttribute("data-state", "active");
    expect(pastTab).toHaveAttribute("data-state", "inactive");
  });

  it("groups cards by date with a header showing the date and count", () => {
    useAgendaMock.mockReturnValue({
      data: [
        step({ id: "a", step_date: "2026-09-18" }),
        step({ id: "b", step_date: "2026-09-18", role: "Recruiter" }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    const group = document.querySelector('[data-slot="agenda-date-group"]');
    expect(group).not.toBeNull();
    const scoped = within(group as HTMLElement);
    expect(scoped.getByText("2 applications")).toBeInTheDocument();
    expect(scoped.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Sep 18, 2026",
    );
  });

  it("renders the card's stage pill, company, role and note row", () => {
    useAgendaMock.mockReturnValue({
      data: [step({ observation: "Bring a laptop" })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Interview - Technical")).toBeInTheDocument();
    expect(screen.getByText("Bring a laptop")).toBeInTheDocument();
  });

  it('shows the readable timezone and "No notes" when there is no observation', () => {
    useAgendaMock.mockReturnValue({
      data: [
        step({
          // A future step_date, not "today" (2026-09-18): a step at 14:00 in
          // a zone far ahead of the fixed clock must never already read as
          // past no matter which zone this suite runs in (e.g. Honolulu, at
          // UTC-10, is already past 2026-09-18T14:00 São Paulo by the time
          // its own local day starts).
          step_date: "2026-09-20",
          start_time: "14:00:00",
          timezone: "America/Sao_Paulo",
          observation: undefined,
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText("America/Sao Paulo")).toBeInTheDocument();
    expect(screen.getByText("No notes")).toBeInTheDocument();
  });

  it("calls genAgendaStepIcsFile with the step itself and toasts on the calendar button", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [step({ id: "step-9", company_name: "Acme" })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.click(
      screen.getByRole("button", { name: /add .* to calendar/i }),
    );

    expect(genAgendaStepIcsFileMock).toHaveBeenCalledTimes(1);
    expect(genAgendaStepIcsFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "step-9", company_name: "Acme" }),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("Calendar event downloaded");
  });

  it("shows the alert button only on Upcoming cards with a start time", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [
        step({
          id: "future-timed",
          step_date: "2026-09-20",
          start_time: "10:00:00",
        }),
        step({
          id: "future-untimed",
          step_date: "2026-09-21",
          start_time: undefined,
          company_name: "Globex",
        }),
        step({
          id: "past-timed",
          step_date: "2026-09-10",
          start_time: "10:00:00",
          company_name: "Initech",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(
      screen.getByRole("button", {
        name: /sound alerts for backend engineer at acme/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: /sound alerts for backend engineer at globex/i,
      }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /past/i }));
    expect(
      screen.queryByRole("button", {
        name: /sound alerts for backend engineer at initech/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("the alert button toggles the notification for that step's own id", async () => {
    const user = userEvent.setup();
    isEnabledMock.mockReturnValue(false);
    useAgendaMock.mockReturnValue({
      data: [
        step({
          id: "step-alert",
          step_date: "2026-09-20",
          start_time: "10:00:00",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    const alertButton = screen.getByRole("button", {
      name: /sound alerts for backend engineer at acme/i,
    });
    expect(alertButton).toHaveAttribute("aria-pressed", "false");

    await user.click(alertButton);

    expect(toggleMock).toHaveBeenCalledWith("step-alert");
  });

  it('the alert button reads aria-pressed="true" once isEnabled says so', () => {
    isEnabledMock.mockReturnValue(true);
    useAgendaMock.mockReturnValue({
      data: [
        step({
          id: "step-on",
          step_date: "2026-09-20",
          start_time: "10:00:00",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(
      screen.getByRole("button", {
        name: /sound alerts for backend engineer at acme/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("the link goes to /applications?focus=<application_id>", () => {
    useAgendaMock.mockReturnValue({
      data: [step({ application_id: "app-42" })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(
      screen.getByRole("link", { name: /open backend engineer at acme/i }),
    ).toHaveAttribute("href", "/applications?focus=app-42");
  });

  it("search and stage filter update both tabs' counts", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [
        step({ id: "a", company_name: "Acme", step_date: "2026-09-20" }),
        step({
          id: "b",
          company_name: "Globex",
          step_date: "2026-09-05",
          interview_type: "hiring_manager",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Search applications..."),
      "acme",
    );

    expect(
      screen.getByRole("tab", { name: /upcoming \(1\)/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /past \(0\)/i }),
    ).toBeInTheDocument();
  });

  it("the stage filter keeps only the chosen interview type, on both tab counts", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [
        step({
          id: "a",
          step_date: "2026-09-20",
          interview_type: "technical",
        }),
        step({
          id: "b",
          step_date: "2026-09-05",
          interview_type: "hiring_manager",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.click(screen.getByRole("combobox", { name: "Filter by stage" }));
    await user.click(screen.getByRole("option", { name: "Hiring manager" }));

    const upcomingTab = screen.getByRole("tab", { name: /upcoming \(0\)/i });
    expect(upcomingTab).toBeInTheDocument();
    expect(upcomingTab.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      "0",
    );
    expect(
      screen.getByRole("tab", { name: /past \(1\)/i }),
    ).toBeInTheDocument();
  });

  it('a filter on a tab that was ALREADY empty still shows "No upcoming interviews", not the filtered message', async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      // Only a Past item — Upcoming starts genuinely empty, before any filter.
      data: [step({ id: "a", step_date: "2026-09-05", company_name: "Acme" })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Search applications..."),
      "acme",
    );

    expect(screen.getByText("No upcoming interviews")).toBeInTheDocument();
    expect(
      screen.queryByText("No interviews match your search"),
    ).not.toBeInTheDocument();
  });

  it("a filter on the Past tab, when it was ALREADY empty, still shows the Past empty state", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      // Only an Upcoming item — Past starts genuinely empty, before any filter.
      data: [step({ id: "a", step_date: "2026-09-20", company_name: "Acme" })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Search applications..."),
      "acme",
    );
    await user.click(screen.getByRole("tab", { name: /past/i }));

    expect(
      screen.getByText("No past interviews in the last 30 days"),
    ).toBeInTheDocument();
  });

  it("the visible (aria-hidden) tab badge shows the same count as the accessible name", () => {
    useAgendaMock.mockReturnValue({
      data: [step({ step_date: "2026-09-20" })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    const upcomingTab = screen.getByRole("tab", { name: /upcoming \(1\)/i });
    const badge = upcomingTab.querySelector('[aria-hidden="true"]');
    expect(badge).toHaveTextContent("1");
  });

  it("the loading skeleton shows role=status and no tab counts yet", () => {
    useAgendaMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("Loading agenda");
    const upcomingTab = screen.getByRole("tab", { name: "Upcoming" });
    expect(upcomingTab.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("clicking Retry on a load error calls refetch", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    useAgendaMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { response: { data: { detail: "Server exploded" } } },
      refetch,
    });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("a filter that empties BOTH tabs still shows the filtered-empty message on the Past tab", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [
        step({ id: "a", step_date: "2026-09-20", company_name: "Acme" }),
        step({ id: "b", step_date: "2026-09-05", company_name: "Acme" }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Search applications..."),
      "nonexistent",
    );
    await user.click(screen.getByRole("tab", { name: /past/i }));

    expect(
      screen.getByText("No interviews match your search"),
    ).toBeInTheDocument();
  });

  it('shows "No upcoming interviews" when the tab is genuinely empty', () => {
    useAgendaMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByText("No upcoming interviews")).toBeInTheDocument();
  });

  it('shows "No past interviews in the last 30 days" on the Past tab when empty', async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.click(screen.getByRole("tab", { name: /past/i }));

    expect(
      screen.getByText("No past interviews in the last 30 days"),
    ).toBeInTheDocument();
  });

  it('shows "No interviews match your search" when a filter empties a non-empty tab', async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [step({ step_date: "2026-09-20" })],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    await user.type(
      screen.getByPlaceholderText("Search applications..."),
      "nonexistent",
    );

    expect(
      screen.getByText("No interviews match your search"),
    ).toBeInTheDocument();
  });

  it("shows the header subtitle, and the stage filter defaults to All stages with the full option list (AC2, AC10)", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [
        step({
          id: "hm",
          step_date: "2026-09-20",
          interview_type: "hiring_manager",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    expect(
      screen.getByText("Your application steps organized by date"),
    ).toBeInTheDocument();

    const combo = screen.getByRole("combobox", { name: "Filter by stage" });
    expect(combo).toHaveTextContent("All stages");
    expect(
      screen.getByRole("tab", { name: "Upcoming (1)" }),
    ).toBeInTheDocument();

    await user.click(combo);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All stages",
      "Unknown",
      "Initial screening",
      "Technical",
      "Cultural",
      "Hiring manager",
      "Take-home",
      "Final",
    ]);
  });

  it("shows the card's time column, meta date/range/converted, All day, a singular group count and toggles the chevron (AC6, AC7)", async () => {
    const user = userEvent.setup();
    useAgendaMock.mockReturnValue({
      data: [
        step({
          id: "timed",
          step_date: "2026-09-20",
          start_time: "14:00:00",
          end_time: "15:00:00",
        }),
        step({
          id: "untimed",
          step_date: "2026-09-21",
          start_time: undefined,
          company_name: "Globex",
        }),
        step({
          id: "foreign",
          step_date: "2026-09-22",
          start_time: "13:00:00",
          end_time: "14:00:00",
          timezone: OTHER_TZ,
          company_name: "Initech",
        }),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    const timedCard = document.querySelector(
      '[data-step-id="timed"]',
    ) as HTMLElement;
    const timeCol = timedCard.querySelector(
      '[data-slot="agenda-time"]',
    ) as HTMLElement;
    expect(within(timeCol).getByText("14:00")).toBeInTheDocument();
    expect(within(timeCol).getByText("15:00")).toBeInTheDocument();
    expect(within(timedCard).getByText("14:00 - 15:00")).toBeInTheDocument();
    expect(within(timedCard).getByText("Sep 20, 2026")).toBeInTheDocument();
    expect(within(timedCard).queryByText("(converted)")).toBeNull();

    const foreignCard = document.querySelector(
      '[data-step-id="foreign"]',
    ) as HTMLElement;
    expect(within(foreignCard).getByText("(converted)")).toBeInTheDocument();

    const untimedCard = document.querySelector(
      '[data-step-id="untimed"]',
    ) as HTMLElement;
    expect(within(untimedCard).getByText("All day")).toBeInTheDocument();
    expect(within(untimedCard).queryByText(/^\d\d:\d\d$/)).toBeNull();

    const timedGroup = document.querySelector(
      '[data-slot="agenda-date-group"][data-date="2026-09-20"]',
    ) as HTMLElement;
    expect(within(timedGroup).getByText("1 application")).toBeInTheDocument();

    const chevron = within(timedCard).getByRole("button", {
      name: "Timeline for Backend Engineer at Acme",
    });
    expect(chevron).toHaveAttribute("aria-expanded", "false");
    await user.click(chevron);
    expect(chevron).toHaveAttribute("aria-expanded", "true");
  });

  it("shows the load error's detail", () => {
    useAgendaMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { response: { data: { detail: "Server exploded" } } },
      refetch: vi.fn(),
    });
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("Server exploded");
  });
});
