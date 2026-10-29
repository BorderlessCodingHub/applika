import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportWebhooksPage } from "./report-webhooks-page";
import { services } from "@/services/services";
import type { AdminReportWebhook } from "@/services/types/admin";

/**
 * Admin report webhooks (ADR-0024): list, add with a badge, change, remove;
 * only the masked address is ever shown; a blank URL on edit keeps the
 * stored one; the server's 409/422 words land inline.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getReportWebhooks: vi.fn(),
      createReportWebhook: vi.fn(),
      updateReportWebhook: vi.fn(),
      deleteReportWebhook: vi.fn(),
    },
  },
}));

const VALID_URL =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz";

const ROW: AdminReportWebhook = {
  id: "w1",
  label: "PSP channel",
  badge: "borderless_psp",
  webhook_url_masked:
    "https://discord.com/api/webhooks/123456789012345678/…wxyz",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: null,
};

const CARRIED: AdminReportWebhook = {
  ...ROW,
  id: "w2",
  label: "Old channel",
  badge: null,
  webhook_url_masked:
    "https://discord.com/api/webhooks/223456789012345678/…abcd",
};

function conflict(detail: string) {
  return new AxiosError("Conflict", "ERR_BAD_REQUEST", undefined, undefined, {
    status: 409,
    statusText: "Conflict",
    headers: new AxiosHeaders(),
    config: {} as never,
    data: { detail },
  });
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReportWebhooksPage />
    </QueryClientProvider>,
  );
}

function row(id: string) {
  return document.querySelector<HTMLElement>(
    `[data-slot="report-webhook-row"][data-webhook-id="${id}"]`,
  )!;
}

beforeEach(() => {
  vi.mocked(services.admin.getReportWebhooks).mockReset();
  vi.mocked(services.admin.createReportWebhook).mockReset();
  vi.mocked(services.admin.updateReportWebhook).mockReset();
  vi.mocked(services.admin.deleteReportWebhook).mockReset();
});

describe("ReportWebhooksPage", () => {
  it("shows the loading state, then the empty state", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    renderPage();

    expect(screen.getByText("Loading webhooks")).toBeInTheDocument();
    expect(await screen.findByText("No webhooks yet")).toBeInTheDocument();
  });

  it("shows the error state with a retry", async () => {
    vi.mocked(services.admin.getReportWebhooks)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce([ROW]);
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("Could not load webhooks"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("PSP channel")).toBeInTheDocument();
  });

  it("lists each webhook with its badge, or none, and only the masked address", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([
      ROW,
      CARRIED,
    ]);
    const { container } = renderPage();

    await screen.findByText("PSP channel");
    expect(row("w1")).toHaveAttribute("data-badge", "borderless_psp");
    expect(within(row("w1")).getByText("PSP")).toBeInTheDocument();
    expect(
      within(row("w1")).getByText(ROW.webhook_url_masked),
    ).toBeInTheDocument();
    expect(row("w2")).toHaveAttribute("data-badge", "none");
    expect(
      within(row("w2")).getByText("No badge, receives nothing"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("Add: requires a URL and a badge", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Webhook URL is required"),
    ).toBeInTheDocument();
    expect(screen.getByText("Choose BASE or PSP")).toBeInTheDocument();
    expect(services.admin.createReportWebhook).not.toHaveBeenCalled();
  });

  it("Add: refuses a URL that is not a Discord webhook and an over-long label", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://example.com/hook",
    );
    await user.click(screen.getByRole("radio", { name: "BASE" }));
    await user.click(screen.getByLabelText("Label"));
    await user.paste("x".repeat(101));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Invalid Discord webhook URL"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Label must be at most 100 characters"),
    ).toBeInTheDocument();
    expect(services.admin.createReportWebhook).not.toHaveBeenCalled();
  });

  it("Add: sends the URL, the badge and the label", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    await user.click(screen.getByRole("radio", { name: "PSP" }));
    await user.type(screen.getByLabelText("Label"), " PSP channel ");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(services.admin.createReportWebhook).toHaveBeenCalledWith({
        webhook_url: VALID_URL,
        badge: "borderless_psp",
        label: "PSP channel",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("Add: shows the server's 409 words inline and keeps the dialog open", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockRejectedValue(
      conflict("This webhook is already saved"),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    await user.click(screen.getByRole("radio", { name: "BASE" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("This webhook is already saved"),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="report-webhook-form-error"]'),
    ).toHaveTextContent("This webhook is already saved");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Edit: reopens with a blank URL and sends only the changed badge", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.updateReportWebhook).mockResolvedValue({
      ...ROW,
      badge: "borderless_base",
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("PSP channel");

    await user.click(screen.getByRole("button", { name: "Edit PSP channel" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Webhook URL")).toHaveValue("");
    expect(
      within(dialog).getByText(ROW.webhook_url_masked),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "PSP" })).toBeChecked();

    await user.click(within(dialog).getByRole("radio", { name: "BASE" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(services.admin.updateReportWebhook).toHaveBeenCalledWith("w1", {
        badge: "borderless_base",
      }),
    );
  });

  it("Edit: a carried-over row with no badge must get one", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([CARRIED]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Old channel");

    await user.click(screen.getByRole("button", { name: "Edit Old channel" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await within(dialog).findByText("Choose BASE or PSP"),
    ).toBeInTheDocument();
    expect(services.admin.updateReportWebhook).not.toHaveBeenCalled();
  });

  it("Delete: asks first, then removes the row", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.deleteReportWebhook).mockResolvedValue();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("PSP channel");

    await user.click(
      screen.getByRole("button", { name: "Delete PSP channel" }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "Reports from Borderless PSP members will no longer be posted to PSP channel.",
    );
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(services.admin.deleteReportWebhook).toHaveBeenCalledWith("w1"),
    );
  });
});
