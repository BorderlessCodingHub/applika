import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPage } from "@/app/(protected)/admin/admin-page";
import AdminLayout from "@/app/(protected)/admin/layout";
import type {
  AdminPlatformStats,
  TopPlatformStat,
  UserGrowthPoint,
} from "@/services/types/admin";
import type { User } from "@/services/types/users";
import { pathname } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  getStats: vi.fn(),
  getUserGrowth: vi.fn(),
  getTopPlatforms: vi.fn(),
  user: { current: null as User | null },
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: mocks.user.current,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/admin";
  return navigationMock;
});

// The desktop dashboard's charts are tested with the desktop page.
vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getStats: mocks.getStats,
      getUserGrowth: mocks.getUserGrowth,
      getTopPlatforms: mocks.getTopPlatforms,
      getSeniorityBreakdown: () => new Promise(() => {}),
      getTopCompanies: () => new Promise(() => {}),
      getActivityHeatmap: () => new Promise(() => {}),
      getUsers: () => new Promise(() => {}),
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

const STATS: AdminPlatformStats = {
  total_users: 1284,
  active_users_30d: 412,
  new_users_7d: 37,
  total_applications: 18402,
  total_offers: 91,
  total_denials: 2310,
  avg_applications_per_user: 14.33,
  global_success_rate: 6.81,
  total_finalized: 3000,
  finalization_rate: 16,
  applications_last_30d: 1200,
};

const month = (date: string, newUsers: number): UserGrowthPoint => ({
  date,
  label: date,
  total_users: 0,
  new_users: newUsers,
});

const GROWTH = [
  month("2026-04-01", 10),
  month("2026-05-01", 20),
  month("2026-06-01", 38),
  month("2026-07-01", 52),
  month("2026-08-01", 61),
  month("2026-09-01", 74),
  month("2026-10-01", 90),
  month("2026-11-01", 112),
];

const PLATFORMS: TopPlatformStat[] = [
  { name: "LinkedIn", total_across_users: 6120, unique_users: 900 },
  { name: "Himalayas", total_across_users: 2244, unique_users: 300 },
];

beforeEach(() => {
  mocks.user.current = ADMIN;
  pathname.current = "/admin";
  mocks.getStats.mockReset().mockResolvedValue(STATS);
  mocks.getUserGrowth.mockReset().mockResolvedValue(GROWTH);
  mocks.getTopPlatforms.mockReset().mockResolvedValue(PLATFORMS);
});

const renderDashboard = () =>
  renderPhoneScreen(
    "/admin",
    <AdminLayout>
      <AdminPage />
    </AdminLayout>,
    { user: mocks.user.current! },
  );

describe("the admin dashboard below md", () => {
  it("renders the Admin board's dashboard: six numbers, the growth bars, the top platforms", async () => {
    await renderDashboard();

    const stats = await waitFor(() => {
      const list = document.querySelector<HTMLElement>(
        'dl[data-slot="admin-stats"]',
      );
      expect(list).not.toBeNull();
      return list!;
    });
    const pairs = Array.from(stats.querySelectorAll("dt")).map((term) => [
      term.textContent,
      term.nextElementSibling?.textContent,
    ]);
    expect(pairs).toEqual([
      ["Total Users", "1,284"],
      ["Active (30d)", "412"],
      ["New (7d)", "37"],
      ["Applications", "18,402"],
      ["Success Rate", "6.8%"],
      ["Avg / User", "14.3"],
    ]);
    expect(stats.querySelector("dd")).toHaveClass("ph-mono", "ph-dd-num");

    const growth = screen.getByRole("region", { name: "New Users / Month" });
    expect(within(growth).getByText("Last 6 months")).toBeInTheDocument();
    const chart = await within(growth).findByRole("img", {
      name: "New users per month, from 38 in June to 112 in November",
    });
    const bars = Array.from(
      chart.querySelectorAll<HTMLElement>(".ph-ad-bar"),
    ).map((bar) => bar.style.height);
    expect(bars).toEqual(["24px", "33px", "38px", "46px", "56px", "70px"]);
    expect(within(chart).getByText("Jun")).toBeInTheDocument();
    expect(within(chart).getByText("Nov")).toBeInTheDocument();

    const top = screen.getByRole("region", { name: "Top Platforms" });
    await waitFor(() =>
      expect(
        Array.from(top.querySelectorAll(".ph-ad-top-row")).map(
          (row) => row.textContent,
        ),
      ).toEqual(["LinkedIn6,120", "Himalayas2,244"]),
    );
  });

  it("shows each section's failure with Retry", async () => {
    let fail: (error: unknown) => void = () => {};
    mocks.getStats.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    mocks.getTopPlatforms.mockResolvedValue([]);
    const user = userEvent.setup();
    await renderDashboard();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading the dashboard");
    fail({ response: { status: 500, data: { detail: "Stats are down" } } });
    expect(await screen.findByText("Stats are down")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Top Platforms" })).getByText(
        "No data yet",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1,284")).toBeInTheDocument();
  });

  it("sends no admin request for someone who is not an administrator", async () => {
    mocks.user.current = { ...SAM, is_admin: false };
    await renderDashboard();

    expect(
      document.querySelector('[data-slot="phone-admin-dashboard"]'),
    ).toBeNull();
    expect(mocks.getStats).not.toHaveBeenCalled();
    expect(mocks.getUserGrowth).not.toHaveBeenCalled();
    expect(mocks.getTopPlatforms).not.toHaveBeenCalled();
  });

  it("renders today's dashboard at md and up, and swaps when the width crosses md", async () => {
    const { viewport } = renderPhonePage(<AdminPage />, { user: ADMIN });
    expect(
      document.querySelector('[data-slot="phone-admin-dashboard"]'),
    ).not.toBeNull();

    viewport.setPhone(false);

    expect(
      document.querySelector('[data-slot="phone-admin-dashboard"]'),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Admin Console" }),
    ).toBeInTheDocument();
  });
});
