import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportDayRoute } from "@/app/(protected)/reports/[day]/report-day-route";
import type {
  ReportDaysType,
  ReportDetailResponse,
  ReportsResponse,
} from "@/services/types/reports";
import type { User } from "@/services/types/users";
import { routerPush, routerReplace } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  detail: vi.fn(),
  submit: vi.fn(),
  list: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/contexts/auth-context", async () => {
  const { useUserProfile } = await import("@/hooks/use-user");
  return {
    useAuth: () => ({
      user: useUserProfile(false).data ?? null,
      isLoading: false,
      logout: mocks.logout,
    }),
  };
});

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/reports/14";
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    reports: {
      fetchReportDetail: mocks.detail,
      submitReport: mocks.submit,
      fetchReports: mocks.list,
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const MEMBER: User = {
  ...SAM,
  badges: [{ badge: "borderless_base", granted_at: "2026-10-01" }],
  borderless: { status: "active", email: "sam@example.com", checked_at: null },
};

const OPEN: ReportDetailResponse = {
  report: { day: 14, phase: 1, submitted: false, submitted_at: null },
  metrics: {
    applications_count: 8,
    initial_screenings_count: 2,
    interviews_completed_fortnight: 3,
    active_processes_count: 4,
    offers_count: 1,
    total_applications_count: 34,
    callback_rate: 0.41,
    offer_rate: 0.06,
    overall_conversion_rate: 0.1,
    total_initial_screenings_count: 14,
  },
  can_submit: true,
  period: { start_date: "2026-10-15", end_date: "2026-10-28" },
};

const SUBMITTED: ReportDetailResponse = {
  ...OPEN,
  report: { ...OPEN.report, submitted: true, submitted_at: "2026-10-28" },
  can_submit: false,
  manual_metrics: {
    mock_interviews_count: 2,
    linkedin_posts_count: 5,
    strategic_connections_count: 7,
    biggest_win: "A final round",
    biggest_challenge: "Take-home tests",
    next_fortnight_goal: "Two offers",
  },
};

const LIST: ReportsResponse = {
  reports: [
    { day: 1, status: "submitted", submitted_at: "2026-10-15" },
    { day: 14, status: "pending", submitted_at: null },
  ],
  current_day: 14,
  current_phase: 1,
  start_date: "2026-10-15",
};

beforeEach(() => {
  mocks.detail.mockReset().mockResolvedValue(OPEN);
  mocks.submit.mockReset().mockResolvedValue({ success: true });
  mocks.list.mockReset().mockResolvedValue(LIST);
  routerPush.mockClear();
  routerReplace.mockClear();
});

const renderDay = (day = 14, user: User = MEMBER) =>
  renderPhoneScreen(
    `/reports/${day}`,
    <ReportDayRoute day={day as ReportDaysType} />,
    { user },
  );

describe("ReportDay below md", () => {
  it("renders the ReportDay board as a form with its bar", async () => {
    await renderDay();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Report — Day 14 of 120",
      }),
    ).toBeInTheDocument();
    const form = document.querySelector('[data-slot="phone-report-day"]')!;
    expect(form.tagName).toBe("FORM");
    expect(form).toHaveAttribute("data-mode", "edit");
    expect(form).toHaveAttribute("data-day", "14");

    // The status pill sits at the right of the back bar ("Reports").
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "Reports" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(await within(bar).findByText("Pending")).toBeInTheDocument();

    const auto = screen.getByRole("region", {
      name: "Auto-Calculated Metrics",
    });
    expect(
      within(auto)
        .getAllByRole("definition")
        .map((value) => value.textContent),
    ).toEqual(["8", "3", "1", "4"]);
    expect(within(auto).getAllByRole("definition")[0]).toHaveClass("ph-dd-num");

    // Day 14: the challenge's start is shown, not picked.
    const start = screen.getByRole("textbox", { name: "Challenge Start Date" });
    expect(start).toHaveAttribute("readonly");
    expect(start).toHaveValue("2026-10-15");
    for (const name of [
      "Mock Interviews",
      "LinkedIn Posts",
      "Strategic Connections",
    ]) {
      const field = screen.getByRole("spinbutton", { name });
      expect(field).toHaveAttribute("inputmode", "numeric");
      expect(field).toHaveValue(0);
    }

    const win = screen.getByRole("textbox", { name: "Biggest Win" });
    expect(win).toHaveAccessibleDescription("280 characters");
    expect(
      screen.getByRole("textbox", {
        name: /What do you want to achieve in the next 14 days/,
      }),
    ).toHaveAccessibleDescription("500 characters");

    const totals = screen.getByRole("region", { name: "Accumulated Totals" });
    expect(within(totals).getByText("41.0%")).toBeInTheDocument();
    expect(within(totals).getByText("6.0%")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(
      screen.getByRole("button", { name: "Submit Report" }),
    ).toHaveAttribute("type", "submit");
  });

  it("names a late report Overdue, as the list does", async () => {
    mocks.list.mockResolvedValue({
      ...LIST,
      current_day: 29,
      reports: [{ day: 14, status: "overdue", submitted_at: null }],
    });
    await renderDay();

    expect(
      await within(screen.getByRole("banner")).findByText("Overdue"),
    ).toBeInTheDocument();
  });

  it("refuses an empty report with each field's words", async () => {
    const user = userEvent.setup();
    await renderDay();

    await user.click(
      await screen.findByRole("button", { name: "Submit Report" }),
    );

    const win = screen.getByRole("textbox", { name: "Biggest Win" });
    await waitFor(() => expect(win).toHaveAttribute("aria-invalid", "true"));
    expect(win).toHaveAccessibleDescription(
      "280 characters Biggest win is required",
    );
    expect(
      screen.getByText("Next fortnight goal is required"),
    ).toBeInTheDocument();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("counts what is typed and submits the report, then goes back to the list", async () => {
    const user = userEvent.setup();
    await renderDay();

    const mock = await screen.findByRole("spinbutton", {
      name: "Mock Interviews",
    });
    await user.clear(mock);
    await user.type(mock, "2");
    const win = screen.getByRole("textbox", { name: "Biggest Win" });
    await user.type(win, "A final round");
    expect(win).toHaveAccessibleDescription("267 characters");
    await user.type(
      screen.getByRole("textbox", { name: "Biggest Challenge" }),
      "Take-home tests",
    );
    await user.type(
      screen.getByRole("textbox", {
        name: /What do you want to achieve in the next 14 days/,
      }),
      "Two offers",
    );
    await user.click(screen.getByRole("button", { name: "Submit Report" }));

    await waitFor(() =>
      expect(mocks.submit).toHaveBeenCalledWith(14, {
        start_date: "2026-10-15",
        mock_interviews_count: 2,
        linkedin_posts_count: 0,
        strategic_connections_count: 0,
        biggest_win: "A final round",
        biggest_challenge: "Take-home tests",
        next_fortnight_goal: "Two offers",
      }),
    );
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/reports"));
  });

  it("picks the challenge's start on day 1 with the date picker", async () => {
    mocks.detail.mockResolvedValue({
      ...OPEN,
      report: { ...OPEN.report, day: 1 },
    });
    await renderDay(1);

    await screen.findByRole("heading", { level: 1, name: /Day 1 of 120/ });
    const trigger = document.querySelector(
      '[data-slot="date-picker-trigger"]',
    )!;
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAccessibleName(/Challenge Start Date/);
    expect(
      screen.queryByRole("textbox", { name: "Challenge Start Date" }),
    ).toBeNull();
  });

  it("shows a submitted report read-only, with no bar", async () => {
    mocks.detail.mockResolvedValue(SUBMITTED);
    await renderDay();

    await screen.findByRole("heading", { level: 1 });
    const root = document.querySelector('[data-slot="phone-report-day"]')!;
    expect(root.tagName).toBe("DIV");
    expect(root).toHaveAttribute("data-mode", "read");
    expect(
      within(screen.getByRole("banner")).getByText("Submitted"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Strategic Connections" }),
    ).toHaveValue("7");
    expect(screen.getByRole("textbox", { name: "Biggest Win" })).toHaveValue(
      "A final round",
    );
    expect(
      screen.getByRole("textbox", {
        name: /What do you want to achieve in the next 14 days/,
      }),
    ).toHaveValue("Two offers");
    expect(screen.queryByRole("button", { name: "Submit Report" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Cancel" })).toBeNull();
  });

  it("sends a day that is not a report day back to the list", async () => {
    await renderDay(15);

    expect(routerReplace).toHaveBeenCalledWith("/reports");
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("shows the closed layout, and asks for nothing, without a membership", async () => {
    await renderDay(14, { ...SAM, badges: [] });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Reports are for Borderless BASE and PSP members",
      }),
    ).toBeInTheDocument();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("shows the report loading, then its failure with Retry", async () => {
    let fail: (error: unknown) => void = () => {};
    mocks.detail.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const user = userEvent.setup();
    await renderDay();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading report");
    fail({ response: { status: 500, data: { detail: "Report is down" } } });
    expect(await screen.findByText("Report is down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Report — Day 14 of 120",
      }),
    ).toBeInTheDocument();
  });

  it("renders today's form at md and up, and swaps when the width crosses md", async () => {
    const { viewport } = renderPhonePage(
      <ReportDayRoute day={14 as ReportDaysType} />,
      { user: MEMBER },
    );
    await screen.findByRole("heading", { level: 1 });
    expect(
      document.querySelector('[data-slot="phone-report-day"]'),
    ).not.toBeNull();

    viewport.setPhone(false);

    expect(document.querySelector('[data-slot="phone-report-day"]')).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Back to Reports" }),
    ).toBeInTheDocument();
  });
});
