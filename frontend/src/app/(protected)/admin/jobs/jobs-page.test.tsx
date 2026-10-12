import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { JobsPage } from "./jobs-page";
import { services } from "@/services/services";
import type { AdminJobSource } from "@/services/types/admin";

/**
 * KODI-049 (plan 0012, T099) — the admin Jobs page: loading, error, empty and
 * ready; the on/off switch PATCHes (R-034); Run now's 202, 409 and 503 (R-035);
 * a long last error wraps (R-033). Pattern: `discord-webhooks-page.test.tsx`
 * (mock `services`, not the hooks). Words are asserted, never classes — except
 * the wrap, whose only observable in jsdom is the wrapping utility itself.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getJobSources: vi.fn(),
      updateJobSource: vi.fn(),
      startJobRun: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const LONG_ERROR = `GET https://himalayas.app/jobs/api?offset=${"9".repeat(900)} answered 429 Too Many Requests`;

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
  is_enabled: true,
  last_run_at: "2026-10-11T23:00:00Z",
  last_run_status: "failed",
  last_run_error: LONG_ERROR,
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <JobsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(services.admin.getJobSources).mockReset();
  vi.mocked(services.admin.updateJobSource).mockReset();
  vi.mocked(services.admin.startJobRun).mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
});

function row(name: string) {
  return screen
    .getByRole("rowheader", { name: new RegExp(name) })
    .closest("tr") as HTMLTableRowElement;
}

describe("JobsPage", () => {
  it("shows the loading state while the sources load", async () => {
    vi.mocked(services.admin.getJobSources).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Job sources", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading job sources");
  });

  it("shows the error state and retries", async () => {
    vi.mocked(services.admin.getJobSources)
      .mockRejectedValueOnce(axiosError(500))
      .mockResolvedValueOnce([HIMALAYAS]);
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load job sources");
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );

    expect(
      await screen.findByRole("rowheader", { name: /Himalayas/ }),
    ).toBeInTheDocument();
  });

  it("shows the empty state with no sources", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("No job sources yet")).toBeInTheDocument();
  });

  it("lists one row per source with every R-033 column", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([
      HIMALAYAS,
      REMOTEOK,
    ]);
    renderPage();

    const table = await screen.findByRole("table", { name: "Job sources" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Source",
      "On",
      "Last run",
      "Status",
      "Found",
      "Saved",
      "Listed jobs",
      "Last error",
    ]);

    const himalayas = row("Himalayas");
    expect(
      within(himalayas).getByRole("switch", { name: "Collect from Himalayas" }),
    ).toBeChecked();
    expect(within(himalayas).getByText("himalayas.app")).toBeInTheDocument();
    expect(within(himalayas).getByText("OK")).toBeInTheDocument();
    expect(within(himalayas).getByText("1,412")).toBeInTheDocument();
    expect(within(himalayas).getByText("37")).toBeInTheDocument();
    expect(within(himalayas).getByText("1,203")).toBeInTheDocument();
    expect(
      within(himalayas)
        .getByText(/14:00 UTC/)
        .closest("time"),
    ).toHaveAttribute("dateTime", HIMALAYAS.last_run_at);

    const remoteok = row("RemoteOK");
    expect(within(remoteok).getByText("Failed")).toBeInTheDocument();
    expect(within(remoteok).getByText(LONG_ERROR)).toBeInTheDocument();
  });

  it("wraps a long last error instead of widening the table", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([REMOTEOK]);
    renderPage();

    const error = await screen.findByText(LONG_ERROR);
    expect(error.className).toMatch(/wrap-anywhere/);
    expect(error.className).toMatch(/whitespace-pre-wrap/);
  });

  it("says Blocked and Not run yet in words", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([
      { ...HIMALAYAS, last_run_status: "blocked" },
      {
        ...REMOTEOK,
        last_run_status: null,
        last_run_at: null,
        last_run_error: null,
      },
    ]);
    renderPage();

    expect(
      await within(await screen.findByRole("table")).findByText("Blocked"),
    ).toBeInTheDocument();
    expect(
      within(row("RemoteOK")).getByText("Not run yet"),
    ).toBeInTheDocument();
    expect(within(row("RemoteOK")).getByText("Never")).toBeInTheDocument();
  });

  it("turns a source off with PATCH {is_enabled: false} (R-034)", async () => {
    let remoteOkEnabled = true;
    vi.mocked(services.admin.getJobSources).mockImplementation(async () => [
      HIMALAYAS,
      { ...REMOTEOK, is_enabled: remoteOkEnabled },
    ]);
    let settle: (value: AdminJobSource) => void = () => {};
    vi.mocked(services.admin.updateJobSource).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderPage();

    const toggle = await screen.findByRole("switch", {
      name: "Collect from RemoteOK",
    });
    await userEvent.click(toggle);

    expect(services.admin.updateJobSource).toHaveBeenCalledWith("s2", {
      is_enabled: false,
    });
    // Optimistic and pending: the requested value shows, further toggles are ignored.
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAttribute("aria-busy", "true");
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(toggle);
    expect(services.admin.updateJobSource).toHaveBeenCalledTimes(1);

    remoteOkEnabled = false;
    settle({ ...REMOTEOK, is_enabled: false });
    await waitFor(() => expect(toggle).not.toHaveAttribute("aria-busy"));
    expect(toggle).not.toBeChecked();
  });

  it("rolls the switch back and toasts the detail when the PATCH fails", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.updateJobSource).mockRejectedValue(
      axiosError(404, "Job source not found"),
    );
    renderPage();

    const toggle = await screen.findByRole("switch", {
      name: "Collect from Himalayas",
    });
    await userEvent.click(toggle);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Job source not found"),
    );
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("Run now: 202 toasts 'Run started' and refetches the list (R-035)", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockResolvedValue({ queued: true });
    renderPage();
    await screen.findByRole("rowheader", { name: /Himalayas/ });
    expect(services.admin.getJobSources).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Run started"),
    );
    await waitFor(() =>
      expect(services.admin.getJobSources).toHaveBeenCalledTimes(2),
    );
  });

  it("Run now: keeps the button focused and ignores clicks while pending", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    const button = screen.getByRole("button", { name: "Run now" });
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    await userEvent.click(button);
    expect(services.admin.startJobRun).toHaveBeenCalledTimes(1);
  });

  it("Run now: 409 shows 'A run is already in progress' on screen", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockRejectedValue(
      axiosError(409, "A run is already in progress"),
    );
    renderPage();
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));

    expect(
      await screen.findByText("A run is already in progress"),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("Run now: 503 shows 'Background service unavailable', dismissable", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockRejectedValue(
      axiosError(503, "Background service unavailable"),
    );
    renderPage();
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    expect(
      await screen.findByText("Background service unavailable"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Dismiss message" }),
    );
    expect(
      screen.queryByText("Background service unavailable"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run now" })).toHaveFocus();
  });

  it("Run now: a failure with no string detail says to try again", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockRejectedValue(axiosError(500));
    renderPage();
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));

    expect(
      await screen.findByText("Could not start a run. Try again."),
    ).toBeInTheDocument();
  });
});
