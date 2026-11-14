import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import InsightsRoute from "@/app/(protected)/insights/page";
import type { Application } from "@/services/types/applications";
import type {
  GeneralStats,
  StepAvgDays,
  StepConversion,
} from "@/services/types/statistics";
import { SAM, ViewedCycle, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  general: vi.fn(),
  conversion: vi.fn(),
  avgDays: vi.fn(),
  mode: vi.fn(),
  getApplications: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/insights";
  return navigationMock;
});

vi.mock("@/services/services", () => ({
  services: {
    statistics: {
      getGeneralStats: mocks.general,
      getStepConversion: mocks.conversion,
      getStepAvgDays: mocks.avgDays,
      getModeStats: mocks.mode,
    },
    applications: { getApplications: mocks.getApplications },
    cycles: {
      getCycles: () =>
        Promise.resolve([
          { id: "c2", name: "Fall 2026", created_at: "", updated_at: null },
        ]),
    },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

// Wednesday 11 November 2026.
const NOW = new Date(2026, 10, 11, 9, 0);

const GENERAL: GeneralStats = {
  total_applications: 34,
  success_rate: 5.9,
  offers: 2,
  denials: 9,
  active: 12,
};

const CONVERSION: StepConversion[] = [
  {
    event_type: "interview",
    interview_type: "initial_screening",
    conversion_rate: 50,
    total_applications: 17,
  },
  {
    event_type: "interview",
    interview_type: "technical",
    conversion_rate: 26,
    total_applications: 9,
  },
  {
    event_type: "offer",
    interview_type: null,
    conversion_rate: 6,
    total_applications: 2,
  },
];

const AVG: StepAvgDays[] = [
  {
    event_type: "interview",
    interview_type: "initial_screening",
    average_days: 6.4,
  },
  { event_type: "interview", interview_type: "technical", average_days: 4 },
  { event_type: "offer", interview_type: null, average_days: 0 },
];

const apps = (dates: string[]) =>
  dates.map(
    (date, index) =>
      ({ id: `a${index}`, application_date: date }) as unknown as Application,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.general.mockReset().mockResolvedValue(GENERAL);
  mocks.conversion.mockReset().mockResolvedValue(CONVERSION);
  mocks.avgDays.mockReset().mockResolvedValue(AVG);
  mocks.mode.mockReset().mockResolvedValue({ active: 28, passive: 6 });
  mocks.getApplications
    .mockReset()
    .mockResolvedValue(
      apps(["2026-11-09", "2026-11-10", "2026-11-02", "2026-09-21"]),
    );
});

afterEach(() => {
  vi.useRealTimers();
});

const renderInsights = () =>
  renderPhoneScreen("/insights", <InsightsRoute />, { extra: <ViewedCycle /> });

describe("InsightsScreen", () => {
  it("heads it with the cycle choice and the initials", async () => {
    await renderInsights();

    expect(
      screen.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeInTheDocument();
    const cycle = screen.getByRole("button", { name: "Current Cycle" });
    expect(cycle).toHaveAttribute("aria-haspopup", "dialog");
    expect(cycle).toHaveAccessibleDescription("Choose a cycle");
    expect(screen.getByRole("link", { name: "Account" })).toHaveTextContent(
      "SC",
    );
  });

  it("shows the success rate with offers, applications and active", async () => {
    await renderInsights();

    const rate = screen.getByRole("region", { name: "Success rate" });
    expect(await within(rate).findByText("5.9%")).toBeInTheDocument();
    expect(within(rate).getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "5.9",
    );
    const stats = within(rate)
      .getAllByRole("term")
      .map((term) => [term.textContent, term.nextElementSibling?.textContent]);
    expect(stats).toEqual([
      ["Offers", "2"],
      ["Applications", "34"],
      ["Active", "12"],
    ]);
  });

  it("draws the funnel from the total and the stages reached", async () => {
    await renderInsights();

    const funnel = screen.getByRole("region", { name: "Funnel" });
    await waitFor(() =>
      expect(
        [...funnel.querySelectorAll("[data-stage]")].map(
          (row) => row.textContent,
        ),
      ).toEqual([
        "Applied34 100%",
        "Screening17 50%",
        "Technical9 26%",
        "Offer2 6%",
      ]),
    );
  });

  it("charts eight weeks of applications, this week last, as one image", async () => {
    await renderInsights();

    const chart = await screen.findByRole("img", {
      name: /^Weekly applications rising from 1 to 2: 1, 0, 0, 0, 0, 0, 1, 2$/,
    });
    expect(chart.querySelectorAll("[data-week]")).toHaveLength(8);
  });

  it("reads the average days per step, never below zero, a dash without data", async () => {
    mocks.conversion.mockResolvedValue([
      CONVERSION[0],
      CONVERSION[1],
      { ...CONVERSION[2], total_applications: 0 },
    ]);
    await renderInsights();

    const days = screen.getByRole("region", { name: "Average days per step" });
    await waitFor(() =>
      expect(
        within(days)
          .getAllByRole("term")
          .map((term) => [
            term.textContent,
            term.nextElementSibling?.textContent,
          ]),
      ).toEqual([
        ["Applied → Screening", "6 days"],
        ["Screening → Technical", "0 days"],
        ["Technical → Offer", "—No data"],
      ]),
    );
  });

  it("splits active and passive", async () => {
    await renderInsights();

    const mode = screen.getByRole("region", { name: "Active vs passive" });
    await waitFor(() => expect(mode).toHaveTextContent("Active 28"));
    expect(mode).toHaveTextContent("Passive 6");
  });

  it("picks an archived cycle from the sheet, read-only, and the app follows it", async () => {
    const user = userEvent.setup();
    await renderInsights();

    await user.click(screen.getByRole("button", { name: "Current Cycle" }));
    const sheet = screen.getByRole("dialog", { name: "Choose a cycle" });
    const options = await within(sheet).findAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual([
      "Current Cycle",
      "Fall 2026",
    ]);
    await user.click(within(sheet).getByRole("radio", { name: "Fall 2026" }));

    expect(
      screen.queryByRole("dialog", { name: "Choose a cycle" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fall 2026" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("viewed-cycle")).toHaveTextContent("c2");
    expect(screen.getByText("Viewing archived cycle")).toBeInTheDocument();
    await waitFor(() => expect(mocks.general).toHaveBeenCalledWith("c2"));
    expect(mocks.getApplications).toHaveBeenCalledWith("c2");
  });

  it("shows today's empty words with no application (PRD 0021 edge case)", async () => {
    mocks.general.mockResolvedValue({
      ...GENERAL,
      total_applications: 0,
      success_rate: 0,
      offers: 0,
      active: 0,
    });
    await renderInsights();

    expect(
      await screen.findByText("No applications found"),
    ).toBeInTheDocument();
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Funnel" }),
    ).not.toBeInTheDocument();
  });

  it("says what failed in its card and retries", async () => {
    const user = userEvent.setup();
    mocks.mode.mockRejectedValueOnce(new Error("down"));
    await renderInsights();

    const mode = screen.getByRole("region", { name: "Active vs passive" });
    await user.click(
      await within(mode).findByRole("button", { name: "Retry" }),
    );
    await waitFor(() => expect(mode).toHaveTextContent("Active 28"));
  });
});
