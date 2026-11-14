import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { JobsPage } from "@/app/(protected)/admin/jobs/jobs-page";
import type { AdminJobSource } from "@/services/types/admin";
import type { User } from "@/services/types/users";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  getJobSources: vi.fn(),
  updateJobSource: vi.fn(),
  startJobRun: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: ADMIN, isLoading: false, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/admin/jobs";
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getJobSources: mocks.getJobSources,
      updateJobSource: mocks.updateJobSource,
      startJobRun: mocks.startJobRun,
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

const HIMALAYAS: AdminJobSource = {
  id: "s1",
  code: "himalayas",
  name: "Himalayas",
  base_url: "https://himalayas.app/jobs/api",
  platform_id: null,
  is_enabled: true,
  last_run_at: "2026-10-12T14:00:00Z",
  last_run_status: "ok",
  last_run_error: null,
  last_run_found: 1412,
  last_run_saved: 37,
  active_jobs: 1203,
};
const REMOTEOK: AdminJobSource = {
  id: "s2",
  code: "remoteok",
  name: "RemoteOK",
  base_url: "https://remoteok.com/api",
  platform_id: null,
  is_enabled: false,
  last_run_at: null,
  last_run_status: "failed",
  last_run_error: "GET answered 429 Too Many Requests",
  last_run_found: null,
  last_run_saved: null,
  active_jobs: 0,
};

function axiosError(status: number, detail?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data: detail === undefined ? {} : { detail } },
  });
}

beforeEach(() => {
  mocks.getJobSources.mockReset().mockResolvedValue([HIMALAYAS, REMOTEOK]);
  mocks.updateJobSource.mockReset();
  mocks.startJobRun.mockReset();
  vi.mocked(toast.success).mockReset();
});

const renderJobs = () =>
  renderPhoneScreen("/admin/jobs", <JobsPage />, { user: ADMIN });

const card = (code: string) =>
  document.querySelector<HTMLElement>(
    `[data-slot="job-source-row"][data-source-code="${code}"]`,
  )!;

describe("the admin Jobs board below md", () => {
  it("draws one card per source, keeping the hooks e2e reads", async () => {
    await renderJobs();

    await screen.findByText("Himalayas");
    expect(
      screen.getByRole("heading", { level: 2, name: "Job sources" }),
    ).toHaveClass("ph-sr");
    expect(
      screen.getByText(
        "The background worker collects jobs every hour from each source that is on. Runs never overlap.",
      ),
    ).toHaveClass("ph-hint");

    const himalayas = card("himalayas");
    expect(himalayas).toHaveAttribute("data-enabled", "true");
    expect(himalayas).toHaveClass("ph-card", "ph-ad-src");
    expect(
      within(himalayas)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Last run", "Status", "Listed jobs"]);
    expect(within(himalayas).getByRole("time")).toHaveAttribute(
      "datetime",
      "2026-10-12T14:00:00Z",
    );
    expect(
      himalayas.querySelector('[data-slot="job-source-outcome"]'),
    ).toHaveAttribute("data-status", "ok");
    expect(
      himalayas.querySelector('[data-slot="job-source-listed"]'),
    ).toHaveTextContent("1,203");
    expect(
      within(himalayas).getByRole("switch", { name: "Collect from Himalayas" }),
    ).toBeChecked();

    const remoteok = card("remoteok");
    expect(remoteok).toHaveAttribute("data-enabled", "false");
    expect(within(remoteok).getByText("Never")).toBeInTheDocument();
    expect(
      within(remoteok).getByText("GET answered 429 Too Many Requests"),
    ).toHaveAttribute("data-slot", "job-source-error");

    expect(screen.getByRole("button", { name: "Run now" })).toHaveAttribute(
      "data-slot",
      "job-run-now",
    );
  });

  it("turns a source on through today's optimistic PATCH, busy while it runs", async () => {
    let finish: () => void = () => {};
    mocks.updateJobSource.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ ...REMOTEOK, is_enabled: true });
      }),
    );
    const user = userEvent.setup();
    await renderJobs();
    await screen.findByText("RemoteOK");

    const toggle = screen.getByRole("switch", {
      name: "Collect from RemoteOK",
    });
    await user.click(toggle);

    expect(mocks.updateJobSource).toHaveBeenCalledWith("s2", {
      is_enabled: true,
    });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    expect(toggle).toHaveAttribute("aria-busy", "true");
    await user.click(toggle);
    expect(mocks.updateJobSource).toHaveBeenCalledOnce();

    finish();
    await waitFor(() => expect(toggle).not.toHaveAttribute("aria-busy"));
  });

  it("starts a run, and says a run already in progress in the notice", async () => {
    mocks.startJobRun
      .mockResolvedValueOnce({ queued: true })
      .mockRejectedValueOnce(axiosError(409, "A run is already in progress"));
    const user = userEvent.setup();
    await renderJobs();
    await screen.findByText("Himalayas");

    const runNow = screen.getByRole("button", { name: "Run now" });
    await user.click(runNow);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Run started"),
    );

    await user.click(runNow);
    const region = document.querySelector(
      '[data-slot="job-run-notice-region"]',
    )!;
    expect(region).toHaveAttribute("aria-live", "polite");
    await waitFor(() =>
      expect(region).toHaveTextContent("A run is already in progress"),
    );
    expect(
      region.querySelector('[data-slot="job-run-notice"]'),
    ).toHaveAttribute("data-tone", "info");

    await user.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(region).toBeEmptyDOMElement();
    expect(runNow).toHaveFocus();
  });

  it("says there is no source yet, and shows a failure with Retry", async () => {
    mocks.getJobSources
      .mockReset()
      .mockRejectedValueOnce(axiosError(500, "Sources are down"))
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    await renderJobs();

    expect(await screen.findByText("Sources are down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No job sources yet")).toBeInTheDocument();
  });

  it("renders today's table at md and up, and swaps when the width crosses md", async () => {
    const { viewport } = renderPhonePage(<JobsPage />, { user: ADMIN });
    await screen.findByText("Himalayas");
    expect(card("himalayas").tagName).toBe("LI");

    viewport.setPhone(false);

    expect(
      screen.getByRole("heading", { level: 1, name: "Job sources" }),
    ).toBeInTheDocument();
    expect(card("himalayas").tagName).toBe("TR");
  });
});
