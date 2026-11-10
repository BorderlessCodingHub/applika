import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardRoute from "@/app/(protected)/dashboard/page";
import type { AgendaStep, Application } from "@/services/types/applications";
import type { GeneralStats } from "@/services/types/statistics";
import type { User } from "@/services/types/users";
import { PickPastCycle, SAM, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  getApplications: vi.fn(),
  getGeneralStats: vi.fn(),
  getAgenda: vi.fn(),
  ics: vi.fn(),
  toastSuccess: vi.fn(),
}));

let currentUser: User = SAM;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/dashboard";
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    applications: { getApplications: mocks.getApplications },
    statistics: { getGeneralStats: mocks.getGeneralStats },
    users: { getAgenda: mocks.getAgenda },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
    timeline: { list: () => Promise.resolve([]) },
  },
}));

vi.mock("@/lib/calendar", () => ({ genAgendaStepIcsFile: mocks.ics }));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

// Today's dialog is tested on its own (timeline-event-form.test.tsx): here
// it is named by what it does, and records which application it is for.
vi.mock("@/components/timeline/timeline-event-form", async () => ({
  TimelineEventForm: (await import("@/test/timeline-dialog-stub"))
    .TimelineEventFormStub,
}));

// Monday 9 November 2026, 11:45, the viewer's own clock.
const NOW = new Date(2026, 10, 9, 11, 45);

function app(overrides: Partial<Application>): Application {
  return {
    id: "a1",
    company_id: null,
    company_name: "Northwind Labs",
    platform_id: "p1",
    role: "Senior Backend Engineer",
    mode: "active",
    application_date: "2026-11-05",
    finalized: false,
    finalized_at: null,
    last_step: null,
    ...overrides,
  };
}

function agendaItem(overrides: Partial<AgendaStep>): AgendaStep {
  return {
    id: "s1",
    step_date: "2026-11-09",
    event_type: "interview",
    interview_type: "technical",
    start_time: "14:00:00",
    end_time: "15:00:00",
    application_id: "a1",
    company_name: "Northwind Labs",
    role: "Senior Backend Engineer",
    ...overrides,
  };
}

const STATS: GeneralStats = {
  total_applications: 34,
  success_rate: 5.9,
  offers: 2,
  denials: 9,
  active: 12,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  currentUser = SAM;
  mocks.getApplications.mockReset().mockResolvedValue([
    app({
      id: "fresh",
      company_name: "Fresh Co",
      application_date: "2026-11-08",
    }),
    app({
      id: "quiet20",
      company_name: "Lumen Health",
      role: "Staff Engineer",
      application_date: "2026-10-20",
    }),
    app({
      id: "quiet40",
      company_name: "Kite Payments",
      role: "Platform Engineer",
      application_date: "2026-09-30",
    }),
    app({
      id: "closed",
      company_name: "Closed Inc",
      application_date: "2026-01-01",
      finalized_at: "2026-02-01T00:00:00Z",
      finalized: true,
    }),
  ]);
  mocks.getGeneralStats.mockReset().mockResolvedValue(STATS);
  mocks.getAgenda.mockReset().mockResolvedValue([
    agendaItem({}),
    agendaItem({
      id: "s2",
      step_date: "2026-11-10",
      interview_type: "initial_screening",
      start_time: "11:00:00",
      end_time: undefined,
      application_id: "a2",
      company_name: "Lumen Health",
    }),
    agendaItem({
      id: "past",
      start_time: "09:00:00",
      application_id: "a3",
      company_name: "Earlier Today",
    }),
  ]);
  mocks.ics.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const renderToday = (extra?: React.ReactNode) =>
  renderPhoneScreen("/dashboard", <DashboardRoute />, { extra });

describe("TodayScreen", () => {
  it("heads the day with the date, the greeting by first name and the initials", async () => {
    await renderToday();

    expect(
      screen.getByRole("heading", { level: 1, name: "Good morning, Sam" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Monday, November 9")).toBeInTheDocument();
    const avatar = screen.getByRole("link", { name: "Account" });
    expect(avatar).toHaveAttribute("href", "/account");
    expect(avatar).toHaveTextContent("SC");
    // The tab bar with Today current, and Add.
    const tabs = screen.getByRole("navigation", { name: "Primary" });
    expect(within(tabs).getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    // No desktop dashboard below md.
    expect(
      screen.queryByRole("heading", { name: "Dashboard" }),
    ).not.toBeInTheDocument();
  });

  it("greets by the username, with its initials, without a first name", async () => {
    currentUser = { ...SAM, username: "octocat", first_name: undefined };
    await renderToday();

    expect(
      screen.getByRole("heading", { level: 1, name: "Good morning, octocat" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toHaveTextContent(
      "OC",
    );
  });

  it("shows the next interview: time to start, range, calendar and Open", async () => {
    const user = userEvent.setup();
    await renderToday();

    const card = await screen.findByRole("region", {
      name: "Technical interview",
    });
    expect(card).toHaveTextContent("Next interview · in 2h 15m");
    expect(card).toHaveTextContent("Northwind Labs · Senior Backend Engineer");
    expect(card).toHaveTextContent("14:00 – 15:00");
    expect(within(card).getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/applications?focus=a1",
    );
    await user.click(
      within(card).getByRole("button", { name: "Add to calendar" }),
    );
    expect(mocks.ics).toHaveBeenCalledWith(
      expect.objectContaining({ id: "s1", application_id: "a1" }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Calendar event downloaded",
    );
  });

  it("lists what comes after it under Coming up, with the day and the time", async () => {
    await renderToday();

    const upcoming = await screen.findByRole("region", { name: "Coming up" });
    const rows = await within(upcoming).findAllByRole("link", {
      name: "Initial screening",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute("href", "/applications?focus=a2");
    expect(rows[0]).toHaveTextContent("TUE");
    expect(rows[0]).toHaveTextContent("10");
    expect(rows[0]).toHaveTextContent("11:00");
    expect(rows[0]).toHaveAccessibleDescription(
      "Lumen Health Tuesday, November 10, 11:00",
    );
    expect(
      within(upcoming).getByRole("link", { name: "Agenda" }),
    ).toHaveAttribute("href", "/agenda");
  });

  it("shows no next-interview card when none is coming (PRD 0021 edge case)", async () => {
    mocks.getAgenda.mockResolvedValue([
      agendaItem({ id: "past", start_time: "09:00:00" }),
    ]);
    await renderToday();

    expect(
      await screen.findByText("No interviews coming up."),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="today-next-interview"]'),
    ).toBeNull();
  });

  it("leads the three numbers to Insights", async () => {
    await renderToday();

    const stats = await screen.findByRole("link", { name: /Active/ });
    expect(stats).toHaveAttribute("href", "/insights");
    expect(stats).toHaveTextContent("12");
    expect(stats).toHaveTextContent("2");
    expect(stats).toHaveTextContent("5.9%");
    expect(
      within(stats).getByRole("img", { name: "See insights" }),
    ).toBeInTheDocument();
  });

  it("lists the quiet open applications, most days first, with Log update and Close it", async () => {
    const user = userEvent.setup();
    await renderToday();

    const section = screen.getByRole("region", {
      name: "Needs your attention",
    });
    const items = await within(section).findAllByRole("listitem");
    expect(
      items.map((item) => item.getAttribute("data-application-id")),
    ).toEqual(["quiet40", "quiet20"]);
    expect(items[0]).toHaveTextContent("Kite Payments");
    expect(items[0]).toHaveTextContent("Platform Engineer");
    expect(items[0]).toHaveTextContent("No update for 40 days");
    expect(section).toHaveTextContent("2");

    await user.click(
      within(items[1]).getByRole("button", { name: "Log update" }),
    );
    expect(screen.getByRole("dialog", { name: "Add event" })).toHaveAttribute(
      "data-application-id",
      "quiet20",
    );
  });

  it("leaves out a quiet open application whose latest event is a denial", async () => {
    mocks.getApplications.mockResolvedValue([
      app({
        id: "quiet20",
        company_name: "Lumen Health",
        application_date: "2026-10-20",
      }),
      app({
        id: "denied",
        company_name: "Denied Corp",
        application_date: "2026-09-01",
        last_step: {
          id: "e1",
          name: "Denied",
          color: "#ef4444",
          date: "2026-09-15",
        },
      }),
    ]);
    await renderToday();

    const section = screen.getByRole("region", {
      name: "Needs your attention",
    });
    const items = await within(section).findAllByRole("listitem");
    expect(
      items.map((item) => item.getAttribute("data-application-id")),
    ).toEqual(["quiet20"]);
    expect(section).not.toHaveTextContent("Denied Corp");
  });

  it("closes a quiet application through today's close dialog", async () => {
    const user = userEvent.setup();
    await renderToday();

    const [first] = await within(
      screen.getByRole("region", { name: "Needs your attention" }),
    ).findAllByRole("listitem");
    const close = within(first).getByRole("button", { name: "Close it" });
    expect(close).toHaveAttribute("aria-haspopup", "dialog");
    expect(close).toHaveAccessibleDescription(
      "Kite Payments Platform Engineer",
    );
    await user.click(close);
    expect(
      screen.getByRole("dialog", { name: "Close application" }),
    ).toHaveAttribute("data-application-id", "quiet40");
  });

  it("hands focus back to Log update when its dialog closes", async () => {
    const user = userEvent.setup();
    await renderToday();
    const items = await within(
      screen.getByRole("region", { name: "Needs your attention" }),
    ).findAllByRole("listitem");
    const logUpdate = within(items[1]).getByRole("button", {
      name: "Log update",
    });

    await user.click(logUpdate);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(logUpdate).toHaveFocus();
  });

  it("sends focus to the attention list when the closed card leaves it", async () => {
    const user = userEvent.setup();
    await renderToday();
    const [first] = await within(
      screen.getByRole("region", { name: "Needs your attention" }),
    ).findAllByRole("listitem");

    await user.click(within(first).getByRole("button", { name: "Close it" }));
    mocks.getApplications.mockResolvedValue([
      app({ id: "quiet20", application_date: "2026-10-20" }),
    ]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="today-attention"] [data-slot="phone-loadable"]',
        ),
      ).toHaveFocus(),
    );
    expect(
      document.querySelector('[data-application-id="quiet40"]'),
    ).toBeNull();
  });

  it("takes an updated card off the list once its event is logged, focus on the list", async () => {
    const user = userEvent.setup();
    await renderToday();
    const [first] = await within(
      screen.getByRole("region", { name: "Needs your attention" }),
    ).findAllByRole("listitem");

    await user.click(within(first).getByRole("button", { name: "Log update" }));
    // The event moves quiet40's latest step to today: no longer quiet.
    mocks.getApplications.mockResolvedValue([
      app({
        id: "quiet40",
        application_date: "2026-09-30",
        last_step: {
          id: "s",
          name: "Initial Screen",
          color: "#000",
          date: "2026-11-09",
        },
      }),
      app({ id: "quiet20", application_date: "2026-10-20" }),
    ]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-application-id="quiet40"]'),
      ).toBeNull(),
    );
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="today-attention"] [data-slot="phone-loadable"]',
        ),
      ).toHaveFocus(),
    );
  });

  it("says all caught up when nothing has gone quiet (PRD 0021 edge case)", async () => {
    mocks.getApplications.mockResolvedValue([
      app({ id: "fresh", application_date: "2026-11-08" }),
    ]);
    await renderToday();

    expect(
      await screen.findByText(
        "All caught up. Every active application has a recent update.",
      ),
    ).toBeInTheDocument();
  });

  it("always reads the current cycle, whatever cycle the app views (PRD 0021 edge case)", async () => {
    const user = userEvent.setup();
    await renderToday(<PickPastCycle />);
    await screen.findByText("No update for 40 days");

    await user.click(screen.getByRole("button", { name: "pick past cycle" }));

    expect(screen.getByText("No update for 40 days")).toBeInTheDocument();
    expect(mocks.getApplications).not.toHaveBeenCalledWith("c2");
    expect(mocks.getGeneralStats).not.toHaveBeenCalledWith("c2");
    // Today keeps its Add on an archived cycle.
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("keeps a long company or role on one line with an ellipsis (PRD 0021 edge case)", async () => {
    mocks.getApplications.mockResolvedValue([
      app({
        id: "long",
        company_name: "A Very Long Company Name That Does Not Fit Anywhere Ltd",
        role: "Principal Distributed Systems Reliability Engineer, Payments",
        application_date: "2026-10-01",
      }),
    ]);
    await renderToday();

    const company = await screen.findByText(
      "A Very Long Company Name That Does Not Fit Anywhere Ltd",
    );
    expect(company).toHaveClass("ph-attn-company");
    expect(
      screen.getByText(
        "Principal Distributed Systems Reliability Engineer, Payments",
      ),
    ).toHaveClass("ph-attn-role");
  });

  it("says what failed and retries", async () => {
    const user = userEvent.setup();
    mocks.getGeneralStats.mockRejectedValueOnce(new Error("down"));
    await renderToday();

    const retry = await screen.findByRole("button", { name: "Retry" });
    await user.click(retry);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Active/ })).toBeInTheDocument(),
    );
  });
});
