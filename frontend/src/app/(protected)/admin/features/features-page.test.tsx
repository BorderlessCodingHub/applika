import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeaturesPage } from "./features-page";
import { formatFeatureDate } from "@/components/admin/feature-copy";
import { services } from "@/services/services";
import type { AdminFeature } from "@/services/types/features";

/**
 * KODI-054 (plan 0013, T048) — `/admin/features` (AC1): the four list states,
 * the six columns, the beta-list count as the API counts it (admins who have
 * it only as admins are not on it), the release date, the admin's own access
 * in words, and the row link to `/admin/features/view?key=`. Pattern:
 * `jobs-page.test.tsx` (mock `services`, not the hooks).
 */

vi.mock("@/services/services", () => ({
  services: { admin: { getFeatures: vi.fn() } },
}));

const JOBS: AdminFeature = {
  key: "jobs",
  name: "Jobs",
  description: "Job board with saved searches.",
  stage: "beta",
  beta_user_count: 3,
  released_at: null,
  updated_at: "2026-10-14T12:00:00Z",
  me: { has: true, via: "admin", opted_out: false },
};

const REPORTS: AdminFeature = {
  key: "reports-v2",
  name: "Reports v2",
  description: null,
  stage: "general",
  beta_user_count: 1,
  released_at: "2026-10-14T12:00:00Z",
  updated_at: "2026-10-14T12:00:00Z",
  me: { has: true, via: "general", opted_out: true },
};

function axiosError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FeaturesPage />
    </QueryClientProvider>,
  );
}

function row(key: string) {
  return document.querySelector(
    `tr[data-slot="feature-row"][data-feature-key="${key}"]`,
  ) as HTMLTableRowElement;
}

beforeEach(() => {
  vi.mocked(services.admin.getFeatures).mockReset();
});

describe("FeaturesPage", () => {
  it("shows the header and the loading state", () => {
    vi.mocked(services.admin.getFeatures).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Features", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "A new feature starts in beta: only users on its beta list and admins have it. Release it to give it to everyone.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading features");
  });

  it("shows the error state and retries", async () => {
    vi.mocked(services.admin.getFeatures)
      .mockRejectedValueOnce(axiosError(500))
      .mockResolvedValueOnce([JOBS]);
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load features");
    expect(alert).toHaveTextContent(
      "The list did not load. Check your connection and try again.",
    );
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );

    expect(await screen.findByRole("link", { name: "Jobs" })).toBeVisible();
    expect(services.admin.getFeatures).toHaveBeenCalledTimes(2);
  });

  it("shows the empty state with no features", async () => {
    vi.mocked(services.admin.getFeatures).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No features yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Features appear here once the database upgrade that adds them has run.",
      ),
    ).toBeInTheDocument();
  });

  it("lists every feature with the six columns (AC1)", async () => {
    vi.mocked(services.admin.getFeatures).mockResolvedValue([JOBS, REPORTS]);
    renderPage();

    await screen.findByRole("link", { name: "Jobs" });
    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      "Key",
      "Name",
      "Stage",
      "Beta users",
      "Released",
      "You",
    ]);

    const jobs = row("jobs");
    expect(jobs).toHaveAttribute("data-stage", "beta");
    expect(
      jobs.querySelector('code[data-slot="feature-key"]'),
    ).toHaveTextContent("jobs");
    expect(jobs).toHaveTextContent("Job board with saved searches.");
    expect(
      jobs.querySelector('[data-slot="feature-beta-count"]'),
    ).toHaveTextContent("3");
    expect(jobs).toHaveTextContent("Not released");
    expect(within(jobs).getByText("Beta", { exact: true })).toBeVisible();

    const reports = row("reports-v2");
    expect(reports).toHaveAttribute("data-stage", "general");
    expect(reports).toHaveTextContent("No description");
    expect(within(reports).getByText("General", { exact: true })).toBeVisible();
    expect(
      reports.querySelector('[data-slot="feature-beta-count"]'),
    ).toHaveTextContent("1");
    expect(reports.querySelector("time")).toHaveTextContent(
      formatFeatureDate("2026-10-14T12:00:00Z"),
    );
  });

  it("links each name to its feature page by key", async () => {
    vi.mocked(services.admin.getFeatures).mockResolvedValue([JOBS, REPORTS]);
    renderPage();

    expect(await screen.findByRole("link", { name: "Jobs" })).toHaveAttribute(
      "href",
      "/admin/features/view?key=jobs",
    );
    expect(screen.getByRole("link", { name: "Reports v2" })).toHaveAttribute(
      "href",
      "/admin/features/view?key=reports-v2",
    );
  });

  it("says in words whether the admin has each feature and why (AC1, AC9)", async () => {
    vi.mocked(services.admin.getFeatures).mockResolvedValue([
      { ...JOBS, key: "a", name: "A" },
      {
        ...JOBS,
        key: "b",
        name: "B",
        me: { has: true, via: "list", opted_out: true },
      },
      {
        ...JOBS,
        key: "c",
        name: "C",
        me: { has: false, via: null, opted_out: true },
      },
      { ...REPORTS, key: "d", name: "D" },
    ]);
    renderPage();

    await screen.findByRole("link", { name: "A" });
    const you = (key: string) =>
      row(key).querySelector('[data-slot="feature-you"]');
    expect(you("a")).toHaveTextContent("Yes, as an admin");
    expect(you("b")).toHaveTextContent("Yes, on the beta list");
    expect(you("c")).toHaveTextContent("No, you turned it off");
    expect(you("c")).toHaveAttribute("data-has", "false");
    expect(you("d")).toHaveTextContent("Yes, released to everyone");
  });

  it("shows a general feature with no release date as not recorded", async () => {
    vi.mocked(services.admin.getFeatures).mockResolvedValue([
      { ...REPORTS, released_at: null },
    ]);
    renderPage();

    await screen.findByRole("link", { name: "Reports v2" });
    expect(row("reports-v2")).toHaveTextContent("Not recorded");
    expect(row("reports-v2")).not.toHaveTextContent("Not released");
  });
});
