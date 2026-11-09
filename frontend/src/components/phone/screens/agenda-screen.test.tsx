import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgendaRoute from "@/app/(protected)/agenda/page";
import { dayKey } from "@/lib/phone-format";
import type { AgendaStep } from "@/services/types/applications";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/*
 * The week, the days and the times are the VIEWER's: run this file under
 * more than one zone (frontend/CLAUDE.md, Agenda):
 *   TZ=UTC pnpm vitest run src/components/phone/screens/agenda-screen.test.tsx
 *   TZ=Asia/Tokyo pnpm vitest run src/components/phone/screens/agenda-screen.test.tsx
 */

const mocks = vi.hoisted(() => ({
  getAgenda: vi.fn(),
  toggle: vi.fn(),
  isEnabled: vi.fn((id: string) => id === "e1"),
  ics: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/agenda";
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    users: { getAgenda: mocks.getAgenda },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

vi.mock("@/contexts/agenda-notifications-context", () => ({
  useAgendaNotifications: () => ({
    toggle: mocks.toggle,
    isEnabled: mocks.isEnabled,
  }),
}));

vi.mock("@/lib/calendar", () => ({ genAgendaStepIcsFile: mocks.ics }));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn(), info: vi.fn() },
}));

// Wednesday 11 November 2026, 09:00 on the viewer's clock.
const NOW = new Date(2026, 10, 11, 9, 0);

function item(overrides: Partial<AgendaStep>): AgendaStep {
  return {
    id: "e1",
    step_date: "2026-11-11",
    event_type: "interview",
    interview_type: "technical",
    start_time: "14:00:00",
    end_time: "15:00:00",
    observation: "Live coding + system design.",
    application_id: "a1",
    company_name: "Northwind Labs",
    role: "Senior Backend Engineer",
    ...overrides,
  };
}

const later = (id: string, date: string, company: string) =>
  item({
    id,
    step_date: date,
    interview_type: "initial_screening",
    start_time: "11:00:00",
    end_time: undefined,
    observation: undefined,
    application_id: `app-${id}`,
    company_name: company,
  });

const ITEMS: AgendaStep[] = [
  item({}),
  item({
    id: "e2",
    start_time: "08:00:00",
    end_time: "08:30:00",
    interview_type: "initial_screening",
    application_id: "a2",
    company_name: "Early Co",
    role: "Recruiter call",
  }),
  item({
    id: "e3",
    start_time: undefined,
    end_time: undefined,
    interview_type: "final",
    application_id: "a3",
    company_name: "All Day Inc",
    role: "Final round",
    observation: undefined,
  }),
  later("l1", "2026-11-12", "Lumen Health"),
  later("l2", "2026-11-13", "Kite Payments"),
  later("l3", "2026-11-16", "Orbit"),
  later("l4", "2026-11-20", "Delta"),
  later("l5", "2026-11-25", "Echo"),
  later("l6", "2026-12-03", "Foxtrot"),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.getAgenda.mockReset().mockResolvedValue(ITEMS);
  mocks.toggle.mockReset();
  mocks.ics.mockReset();
  mocks.toastSuccess.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const renderAgenda = () => renderPhoneScreen("/agenda", <AgendaRoute />);

const week = () => screen.getByRole("tablist", { name: /^Week of/ });

describe("AgendaScreen", () => {
  it("heads the week with the month, the arrows and the initials", async () => {
    await renderAgenda();

    expect(
      screen.getByRole("heading", { level: 1, name: "Agenda" }),
    ).toBeInTheDocument();
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Previous week" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next week" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toHaveTextContent(
      "SC",
    );
    // A tab root without Add.
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
  });

  it("draws the week Monday first, today chosen, a dot on the days with interviews", async () => {
    await renderAgenda();

    expect(week()).toHaveAccessibleName("Week of Nov 9");
    const days = within(week()).getAllByRole("tab");
    expect(days.map((day) => day.getAttribute("data-day"))).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(days[2]).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(days[2]).toHaveAccessibleName("Wed Nov 11, today, has events"),
    );
    expect(days[1]).toHaveAccessibleName("Tue Nov 10");
    expect(mocks.getAgenda).toHaveBeenCalledWith({
      from_date: "2026-11-08",
      to_date: "2027-01-15",
    });
  });

  it("shows the chosen day's interviews in start order, with time, stage, time to start and notes", async () => {
    await renderAgenda();

    const day = await screen.findByRole("tabpanel", {
      name: "Today · Wed, Nov 11",
    });
    const cards = await within(day).findAllByRole("article");
    expect(cards.map((card) => card.getAttribute("data-event-id"))).toEqual([
      "e3",
      "e2",
      "e1",
    ]);
    const [allDay, done, upcoming] = cards;

    expect(upcoming).toHaveAccessibleName("Senior Backend Engineer");
    expect(upcoming).toHaveTextContent("14:00");
    expect(upcoming).toHaveTextContent("15:00");
    expect(upcoming).toHaveTextContent("Technical");
    expect(upcoming).toHaveTextContent("in 5h");
    expect(upcoming).toHaveTextContent("Northwind Labs · 1 h");
    expect(upcoming).toHaveTextContent("Live coding + system design.");

    expect(done).toHaveTextContent("Done");
    expect(done).toHaveTextContent("Early Co · 30 min");
    expect(allDay).toHaveTextContent("All day");
    expect(allDay).toHaveTextContent("Final");
  });

  it("puts the sound-alert bell on a timed upcoming card only", async () => {
    const user = userEvent.setup();
    await renderAgenda();

    const day = await screen.findByRole("tabpanel", { name: /^Today/ });
    const bells = await within(day).findAllByRole("button", {
      name: /^Sound alerts for/,
    });
    expect(bells).toHaveLength(1);
    expect(bells[0]).toHaveAccessibleName(
      "Sound alerts for Senior Backend Engineer at Northwind Labs, 30, 15 and 5 minutes before",
    );
    expect(bells[0]).toHaveAttribute("aria-pressed", "true");
    await user.click(bells[0]);
    expect(mocks.toggle).toHaveBeenCalledWith("e1");
  });

  it("downloads the calendar file and opens the application", async () => {
    const user = userEvent.setup();
    await renderAgenda();

    const card = (await screen.findAllByRole("article")).find(
      (article) => article.getAttribute("data-event-id") === "e1",
    )!;
    await user.click(
      within(card).getByRole("button", {
        name: "Add Senior Backend Engineer at Northwind Labs to calendar",
      }),
    );
    expect(mocks.ics).toHaveBeenCalledWith(
      expect.objectContaining({ id: "e1" }),
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Calendar event downloaded",
    );
    expect(
      within(card).getByRole("link", {
        name: "Open Senior Backend Engineer at Northwind Labs",
      }),
    ).toHaveAttribute("href", "/applications?focus=a1");
  });

  it("lists the next five after the chosen day under Later", async () => {
    await renderAgenda();

    const laterList = await screen.findByRole("region", { name: "Later" });
    const rows = await within(laterList).findAllByRole("link");
    expect(rows.map((row) => row.getAttribute("data-application-id"))).toEqual([
      "app-l1",
      "app-l2",
      "app-l3",
      "app-l4",
      "app-l5",
    ]);
    expect(rows[0]).toHaveAccessibleName("Initial screening");
    expect(rows[0]).toHaveTextContent("THU");
    expect(rows[0]).toHaveTextContent("11:00");
  });

  it("says when a day is empty", async () => {
    const user = userEvent.setup();
    await renderAgenda();
    await screen.findAllByRole("article");

    await user.click(within(week()).getByRole("tab", { name: "Tue Nov 10" }));

    expect(
      await screen.findByText("Nothing scheduled this day."),
    ).toBeInTheDocument();
    // Later counts from the chosen day.
    const laterList = screen.getByRole("region", { name: "Later" });
    expect(
      within(laterList)
        .getAllByRole("link")
        .map((row) => row.getAttribute("data-application-id")),
    ).toEqual(["a3", "a2", "a1", "app-l1", "app-l2"]);
  });

  it("moves by week, keeping the weekday, and comes back to today", async () => {
    const user = userEvent.setup();
    await renderAgenda();
    await screen.findAllByRole("article");

    await user.click(screen.getByRole("button", { name: "Next week" }));

    expect(week()).toHaveAccessibleName("Week of Nov 16");
    expect(within(week()).getByRole("tab", { selected: true })).toHaveAttribute(
      "data-day",
      "2026-11-18",
    );
    expect(mocks.getAgenda).toHaveBeenLastCalledWith({
      from_date: "2026-11-15",
      to_date: "2027-01-22",
    });

    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(within(week()).getByRole("tab", { selected: true })).toHaveAttribute(
      "data-day",
      "2026-11-11",
    );
  });

  it("puts a step from another zone on the viewer's own day and time", async () => {
    // 08:00 in Tokyo on the 12th is 23:00 UTC on the 11th.
    const instant = new Date(Date.UTC(2026, 10, 11, 23, 0));
    mocks.getAgenda.mockResolvedValue([
      item({
        id: "tokyo",
        step_date: "2026-11-12",
        start_time: "08:00:00",
        end_time: "09:00:00",
        timezone: "Asia/Tokyo",
      }),
    ]);
    await renderAgenda();

    const expectedDay = dayKey(instant);
    const tab = within(week()).getByRole("tab", { selected: true });
    if (tab.getAttribute("data-day") !== expectedDay) {
      const user = userEvent.setup();
      await user.click(
        within(week())
          .getAllByRole("tab")
          .find((day) => day.getAttribute("data-day") === expectedDay)!,
      );
    }
    const card = await screen.findByRole("article");
    const hh = String(instant.getHours()).padStart(2, "0");
    expect(card).toHaveTextContent(`${hh}:00`);
    expect(
      within(week())
        .getAllByRole("tab")
        .find((day) => day.getAttribute("data-day") === expectedDay),
    ).toHaveAttribute("data-events", "true");
  });

  it("says what failed and retries", async () => {
    const user = userEvent.setup();
    mocks.getAgenda.mockRejectedValueOnce(new Error("down"));
    await renderAgenda();

    const [retry] = await screen.findAllByRole("button", { name: "Retry" });
    await user.click(retry);
    expect(await screen.findAllByRole("article")).toHaveLength(3);
  });
});
