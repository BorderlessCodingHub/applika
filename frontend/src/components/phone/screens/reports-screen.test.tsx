import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReportPage from "@/app/(protected)/reports/page";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import type { ReportsResponse } from "@/services/types/reports";
import type { User } from "@/services/types/users";
import {
  PickPastCycle,
  SAM,
  renderPhonePage,
  renderPhoneScreen,
} from "@/test/phone-screens";
import { reportsData } from "./reports-screen";

const mocks = vi.hoisted(() => ({
  fetchReports: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
  user: { current: null as User | null },
}));

// The user comes from the cache, as `AuthProvider` reads it: a report
// request answered AUTH-1050 locks it there, and the gate follows.
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
  pathname.current = "/reports";
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    reports: { fetchReports: mocks.fetchReports },
    cycles: {
      getCycles: () =>
        Promise.resolve([
          { id: "c2", name: "Fall 2026", created_at: "", updated_at: null },
        ]),
    },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const MEMBER: User = {
  ...SAM,
  badges: [{ badge: "borderless_psp", granted_at: "2026-10-01" }],
  borderless: { status: "active", email: "sam@example.com", checked_at: null },
};

/** Day 29: days 1 and 14 submitted, day 28 overdue by one day. */
const ON_DAY_29: ReportsResponse = {
  reports: [
    { day: 1, status: "submitted", submitted_at: "2026-10-15T10:00:00Z" },
    { day: 14, status: "submitted", submitted_at: "2026-10-28T10:00:00Z" },
    { day: 28, status: "overdue", submitted_at: null },
    { day: 42, status: "future", submitted_at: null },
    { day: 56, status: "future", submitted_at: null },
  ],
  current_day: 29,
  current_phase: 1,
  start_date: "2026-10-15",
};

beforeEach(() => {
  mocks.user.current = MEMBER;
  mocks.fetchReports.mockReset().mockResolvedValue(ON_DAY_29);
  mocks.logout.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

const renderReports = (extra?: React.ReactNode) =>
  renderPhoneScreen("/reports", <ReportPage />, {
    user: mocks.user.current!,
    extra,
  });

describe("reportsData", () => {
  it("puts the API's next report first with its due day, then submitted (newest first) and upcoming", () => {
    const data = reportsData(ON_DAY_29);

    expect(data.currentDay).toBe(29);
    expect(data.totalDays).toBe(120);
    // Overdue by one day reads pending (within 14 days of its day), as today.
    expect(data.current).toMatchObject({
      day: 28,
      phase: 1,
      status: "pending",
      href: "/reports/28",
    });
    expect(data.current?.due).toEqual(new Date(2026, 10, 11));
    expect(data.submitted.map((item) => item.day)).toEqual([14, 1]);
    expect(data.upcoming.map((item) => [item.day, item.phase])).toEqual([
      [42, 2],
      [56, 2],
    ]);
  });

  it("keeps a report overdue past 14 days, and no due day without a start", () => {
    const data = reportsData({
      ...ON_DAY_29,
      current_day: 43,
      start_date: "",
    });
    expect(data.current?.status).toBe("overdue");
    expect(data.current?.due).toBeNull();
  });
});

describe("Reports below md", () => {
  it("renders the Reports board for a member", async () => {
    await renderReports();

    expect(
      screen.getByRole("heading", { level: 1, name: "My Reports — 120 Days" }),
    ).toBeInTheDocument();
    const progress = await screen.findByRole("progressbar", {
      name: "Challenge progress",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "29");
    expect(progress).toHaveAttribute("aria-valuemax", "120");
    expect(screen.getByText(/Reports are due every/)).toHaveClass("ph-rp-tip");

    const current = screen.getByRole("region", { name: "Current" });
    const currentCard = current.querySelector('[data-day="28"]')!;
    expect(currentCard).toHaveAttribute("data-status", "pending");
    expect(currentCard).toHaveClass("ph-rp-current");
    expect(within(current).getByText("Day 28")).toBeInTheDocument();
    expect(within(current).getByText("Pending")).toBeInTheDocument();
    expect(within(current).getByText("Phase 1 · due Nov 11")).toBeVisible();
    expect(
      within(current).getByRole("link", { name: "Fill Report" }),
    ).toHaveAttribute("href", "/reports/28");

    const submitted = screen.getByRole("region", { name: "Submitted" });
    const day14 = within(submitted).getByRole("link", { name: /Day 14/ });
    expect(day14).toHaveAttribute("href", "/reports/14");
    expect(within(day14).getByText("Submitted")).toBeInTheDocument();

    const upcoming = screen.getByRole("region", { name: "Upcoming" });
    expect(within(upcoming).getByText("Day 42 · Phase 2")).toBeVisible();
    expect(within(upcoming).getAllByText("Not available")).toHaveLength(2);
    expect(within(upcoming).queryByRole("link")).toBeNull();
  });

  it("offers no Fill Report on an archived cycle", async () => {
    const user = userEvent.setup();
    await renderReports(<PickPastCycle />);
    await screen.findByRole("link", { name: "Fill Report" });

    await user.click(screen.getByRole("button", { name: "pick past cycle" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Fill Report" })).toBeNull(),
    );
    const current = screen.getByRole("region", { name: "Current" });
    expect(within(current).getByText("Not available")).toBeInTheDocument();
    expect(mocks.fetchReports).toHaveBeenLastCalledWith("c2");
  });

  it("explains why Reports are closed without a membership, and asks for nothing", async () => {
    mocks.user.current = { ...SAM, badges: [] };
    const user = userEvent.setup();
    await renderReports();

    const closed = document.querySelector('[data-slot="reports-closed"]')!;
    expect(closed).toHaveAttribute("data-reason", "none");
    expect(closed.querySelector(".ph-rp-lock")).not.toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Reports are for Borderless BASE and PSP members",
      }),
    ).toHaveClass("ph-rp-closed-h1");
    expect(
      screen.getByText(/has no BASE or PSP membership on record/),
    ).toBeInTheDocument();
    const visit = screen.getByRole("link", {
      name: "Visit Borderless Opens in a new tab.",
    });
    expect(visit).toHaveClass("ph-btn", "ph-pri");
    expect(visit).toHaveAttribute("target", "_blank");
    const again = screen.getByRole("button", { name: "Sign in again" });
    expect(again).toHaveClass("ph-sec");
    expect(again).toHaveAttribute("data-action", "badge-gate-sign-in-again");

    await user.click(again);
    expect(mocks.logout).toHaveBeenCalledWith("/login");
    expect(mocks.fetchReports).not.toHaveBeenCalled();
  });

  it("asks to sign in again while the Borderless sign-in has ended (AUTH-1050)", async () => {
    mocks.user.current = {
      ...MEMBER,
      borderless: { ...MEMBER.borderless!, status: "needs_reconnect" },
    };
    const user = userEvent.setup();
    await renderReports();

    expect(
      document.querySelector('[data-slot="reports-closed"]'),
    ).toHaveAttribute("data-reason", "needs_reconnect");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Sign in again to open your reports",
      }),
    ).toBeInTheDocument();
    const again = screen.getByRole("button", { name: "Sign in again" });
    expect(again).toHaveClass("ph-pri");
    expect(again).toHaveAccessibleDescription(
      "Your Borderless sign-in has ended. Sign in again on the applika website to use member features",
    );
    expect(screen.queryByRole("link", { name: /Visit Borderless/ })).toBeNull();
    expect(document.querySelector("input")).toBeNull();

    await user.click(again);
    expect(mocks.logout).toHaveBeenCalledWith("/login");
    expect(mocks.fetchReports).not.toHaveBeenCalled();
  });

  it("closes when a report request answers 403 AUTH-1050", async () => {
    mocks.fetchReports.mockRejectedValue(
      new AxiosError("Forbidden", "403", undefined, undefined, {
        status: 403,
        data: { code: "AUTH-1050", detail: "ended" },
      } as AxiosResponse),
    );
    const { client } = await renderReports();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Sign in again to open your reports",
      }),
    ).toHaveFocus();
    expect(client.getQueryData<User>(USER_QUERY_KEY)?.borderless?.status).toBe(
      "needs_reconnect",
    );
    expect(document.querySelector('[data-slot="phone-reports"]')).toBeNull();
  });

  it("shows the reports loading, then their failure with Retry", async () => {
    let fail: (error: unknown) => void = () => {};
    mocks.fetchReports.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const user = userEvent.setup();
    await renderReports();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading reports");
    expect(screen.queryByRole("progressbar")).toBeNull();
    fail({ response: { status: 500, data: { detail: "Reports are down" } } });
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("link", { name: "Fill Report" }),
    ).toBeInTheDocument();
  });

  it("renders today's list at md and up, and swaps when the width crosses md", async () => {
    const { viewport } = renderPhonePage(<ReportPage />, { user: MEMBER });
    await screen.findByRole("link", { name: "Fill Report" });

    viewport.setPhone(false);

    expect(document.querySelector('[data-slot="phone-reports"]')).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Fill Report" }),
    ).toBeInTheDocument();
  });

  it("keeps today's explanation at md and up", () => {
    mocks.user.current = { ...SAM, badges: [] };
    const { viewport } = renderPhonePage(<ReportPage />, {
      user: mocks.user.current,
    });
    viewport.setPhone(false);

    expect(document.querySelector('[data-slot="reports-closed"]')).toBeNull();
    expect(
      screen.getByRole("heading", {
        name: "Reports are for Borderless BASE and PSP members",
      }),
    ).not.toHaveClass("ph-rp-closed-h1");
  });
});
