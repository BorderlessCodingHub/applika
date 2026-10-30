import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportWebhooksPage } from "./report-webhooks-page";
import { services } from "@/services/services";
import type { AdminReportWebhook } from "@/services/types/admin";

/**
 * Admin report webhooks (ADR-0024): list, add with one or more badges,
 * change the set, remove; only the masked address is ever shown; a blank URL
 * on edit keeps the stored one; the server's 409/422 words land inline; the
 * page carries no chat-service wording outside the address field.
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
  badges: ["borderless_psp"],
  webhook_url_masked:
    "https://discord.com/api/webhooks/123456789012345678/…wxyz",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: null,
};

const BOTH: AdminReportWebhook = {
  ...ROW,
  id: "w3",
  label: "Shared channel",
  badges: ["borderless_base", "borderless_psp"],
  webhook_url_masked:
    "https://discord.com/api/webhooks/323456789012345678/…efgh",
};

const CARRIED: AdminReportWebhook = {
  ...ROW,
  id: "w2",
  label: "Old channel",
  badges: [],
  webhook_url_masked:
    "https://discord.com/api/webhooks/223456789012345678/…abcd",
};

function httpError(status: number, detail: string) {
  return new AxiosError("Error", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
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

/**
 * Every word a user can see or hear in `root`, minus the stored addresses
 * themselves (the masked URL in a row and in the edit dialog) — the one place
 * R-039 allows the chat service's name.
 */
function wordsOutsideAddresses(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      '[data-slot="report-webhook-url"], [data-slot="report-webhook-url-current"]',
    )
    .forEach((el) => el.remove());
  const attrs = Array.from(clone.querySelectorAll("*")).flatMap((el) =>
    ["aria-label", "title", "alt"].map((a) => el.getAttribute(a) ?? ""),
  );
  return [clone.textContent ?? "", ...attrs].join(" ");
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

  it("lists every badge a webhook holds, or none, and only the masked address", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([
      ROW,
      BOTH,
      CARRIED,
    ]);
    const { container } = renderPage();

    await screen.findByText("PSP channel");
    expect(row("w1")).toHaveAttribute("data-badges", "borderless_psp");
    expect(within(row("w1")).getByText("PSP")).toBeInTheDocument();
    expect(within(row("w1")).queryByText("BASE")).not.toBeInTheDocument();
    expect(
      within(row("w1")).getByText(ROW.webhook_url_masked),
    ).toBeInTheDocument();

    expect(row("w3")).toHaveAttribute(
      "data-badges",
      "borderless_base borderless_psp",
    );
    const chips = row("w3").querySelectorAll(
      '[data-slot="report-webhook-badge"]',
    );
    expect(Array.from(chips, (c) => c.textContent)).toEqual(["BASE", "PSP"]);

    expect(row("w2")).toHaveAttribute("data-badges", "none");
    expect(
      within(row("w2")).getByText("No badge, receives nothing"),
    ).toBeInTheDocument();
    expect(container.textContent).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });

  it("shows no Discord wording outside the address field (R-039)", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([
      ROW,
      BOTH,
      CARRIED,
    ]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("PSP channel");

    expect(wordsOutsideAddresses(document.body)).not.toMatch(/discord/i);

    // The delete confirmation.
    await user.click(
      screen.getByRole("button", { name: "Delete Shared channel" }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(wordsOutsideAddresses(confirm)).not.toMatch(/discord/i);
    await user.click(within(confirm).getByRole("button", { name: "Cancel" }));

    // The add dialog: help, badges, label; only the URL placeholder names it.
    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    const add = await screen.findByRole("dialog", { name: "Add webhook" });
    expect(wordsOutsideAddresses(add)).not.toMatch(/discord/i);
    expect(within(add).getByLabelText("Webhook URL")).toHaveAttribute(
      "placeholder",
      "https://discord.com/api/webhooks/…",
    );
    expect(
      within(add).getByText("Only a masked form is shown after saving."),
    ).toBeInTheDocument();
    await user.click(within(add).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // The edit dialog: the stored address is the only place it shows.
    await user.click(
      screen.getByRole("button", { name: "Edit Shared channel" }),
    );
    const edit = await screen.findByRole("dialog", { name: "Edit webhook" });
    expect(wordsOutsideAddresses(edit)).not.toMatch(/discord/i);
  });

  it("offers BASE and PSP as a labelled checkbox group with a hint each", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    const group = await screen.findByRole("group", { name: "Badges" });
    const base = within(group).getByRole("checkbox", { name: "BASE" });
    const psp = within(group).getByRole("checkbox", { name: "PSP" });
    expect(base).not.toBeChecked();
    expect(psp).not.toBeChecked();
    expect(base).toHaveAccessibleDescription(
      "Reports from Borderless BASE members.",
    );
    expect(psp).toHaveAccessibleDescription(
      "Reports from Borderless PSP members.",
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("Add: requires a URL and at least one badge", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Webhook URL is required"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Choose at least one badge: BASE or PSP"),
    ).toBeInTheDocument();
    expect(services.admin.createReportWebhook).not.toHaveBeenCalled();
  });

  it("Add: checking then unchecking the only badge is refused", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    const base = screen.getByRole("checkbox", { name: "BASE" });
    await user.click(base);
    await user.click(base);
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Choose at least one badge: BASE or PSP"),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Badges" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
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
    await user.click(screen.getByRole("checkbox", { name: "BASE" }));
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

  it("Add: sends the URL, one badge and the label", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    await user.click(screen.getByRole("checkbox", { name: "PSP" }));
    await user.type(screen.getByLabelText("Label"), " PSP channel ");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(services.admin.createReportWebhook).toHaveBeenCalledWith({
        webhook_url: VALID_URL,
        badges: ["borderless_psp"],
        label: "PSP channel",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("Add: sends both badges, in base, psp order, whatever the click order", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockResolvedValue(BOTH);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    await user.click(screen.getByRole("checkbox", { name: "PSP" }));
    await user.click(screen.getByRole("checkbox", { name: "BASE" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(services.admin.createReportWebhook).toHaveBeenCalledWith({
        webhook_url: VALID_URL,
        badges: ["borderless_base", "borderless_psp"],
        label: undefined,
      }),
    );
  });

  it("Add: shows the server's 409 words inline and keeps the dialog open", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockRejectedValue(
      httpError(409, "This webhook is already configured"),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    await user.click(screen.getByRole("checkbox", { name: "BASE" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("This webhook is already configured"),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="report-webhook-form-error"]'),
    ).toHaveTextContent("This webhook is already configured");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it.each([
    "Choose at least one badge: BASE or PSP",
    "Badge must be BASE or PSP",
    "Each badge can be chosen once",
  ])("Add: shows the server's 422 %j verbatim", async (detail) => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockRejectedValue(
      httpError(422, detail),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("No webhooks yet");

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    await user.click(screen.getByRole("checkbox", { name: "BASE" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="report-webhook-form-error"]'),
      ).toHaveTextContent(detail),
    );
  });

  it("Edit: reopens with a blank URL and the stored set, and sends the whole new set", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.updateReportWebhook).mockResolvedValue({
      ...ROW,
      badges: ["borderless_base", "borderless_psp"],
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
    expect(within(dialog).getByRole("checkbox", { name: "PSP" })).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: "BASE" }),
    ).not.toBeChecked();

    await user.click(within(dialog).getByRole("checkbox", { name: "BASE" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(services.admin.updateReportWebhook).toHaveBeenCalledWith("w1", {
        badges: ["borderless_base", "borderless_psp"],
      }),
    );
  });

  it("Edit: narrowing both badges to PSP replaces the set", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([BOTH]);
    vi.mocked(services.admin.updateReportWebhook).mockResolvedValue({
      ...BOTH,
      badges: ["borderless_psp"],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Shared channel");

    await user.click(
      screen.getByRole("button", { name: "Edit Shared channel" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("checkbox", { name: "BASE" }),
    ).toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: "BASE" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(services.admin.updateReportWebhook).toHaveBeenCalledWith("w3", {
        badges: ["borderless_psp"],
      }),
    );
  });

  it("Edit: unchecking every badge is refused", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([ROW]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("PSP channel");

    await user.click(screen.getByRole("button", { name: "Edit PSP channel" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "PSP" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await within(dialog).findByText("Choose at least one badge: BASE or PSP"),
    ).toBeInTheDocument();
    expect(services.admin.updateReportWebhook).not.toHaveBeenCalled();
  });

  it("Edit: a label-only change sends only the label", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([BOTH]);
    vi.mocked(services.admin.updateReportWebhook).mockResolvedValue(BOTH);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Shared channel");

    await user.click(
      screen.getByRole("button", { name: "Edit Shared channel" }),
    );
    const dialog = await screen.findByRole("dialog");
    // Toggling a badge off and on again leaves the set unchanged: not sent.
    const psp = within(dialog).getByRole("checkbox", { name: "PSP" });
    await user.click(psp);
    await user.click(psp);
    const label = within(dialog).getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "Shared reports");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(services.admin.updateReportWebhook).toHaveBeenCalledWith("w3", {
        label: "Shared reports",
      }),
    );
  });

  it("Edit: a URL typed and cleared again keeps the stored one", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.updateReportWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("PSP channel");

    await user.click(screen.getByRole("button", { name: "Edit PSP channel" }));
    const dialog = await screen.findByRole("dialog");
    const url = within(dialog).getByLabelText("Webhook URL");
    await user.type(url, "https://discord.com");
    await user.clear(url);
    await user.click(within(dialog).getByRole("checkbox", { name: "BASE" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(services.admin.updateReportWebhook).toHaveBeenCalledWith("w1", {
        badges: ["borderless_base", "borderless_psp"],
      }),
    );
  });

  it("Edit: a carried-over row opens with none checked and must get one", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([CARRIED]);
    vi.mocked(services.admin.updateReportWebhook).mockResolvedValue({
      ...CARRIED,
      badges: ["borderless_base"],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Old channel");

    await user.click(screen.getByRole("button", { name: "Edit Old channel" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("checkbox", { name: "BASE" }),
    ).not.toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: "PSP" }),
    ).not.toBeChecked();
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await within(dialog).findByText("Choose at least one badge: BASE or PSP"),
    ).toBeInTheDocument();
    expect(services.admin.updateReportWebhook).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("checkbox", { name: "BASE" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(services.admin.updateReportWebhook).toHaveBeenCalledWith("w2", {
        badges: ["borderless_base"],
      }),
    );
  });

  it("Edit: shows the server's 404 words inline", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.updateReportWebhook).mockRejectedValue(
      httpError(404, "Report webhook not found"),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("PSP channel");

    await user.click(screen.getByRole("button", { name: "Edit PSP channel" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "BASE" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    expect(
      await within(dialog).findByText("Report webhook not found"),
    ).toBeInTheDocument();
  });

  it("Delete: asks first, naming every badge, then removes the row", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([BOTH]);
    vi.mocked(services.admin.deleteReportWebhook).mockResolvedValue();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Shared channel");

    await user.click(
      screen.getByRole("button", { name: "Delete Shared channel" }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "Reports from Borderless BASE and PSP members will no longer be posted to Shared channel.",
    );
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(services.admin.deleteReportWebhook).toHaveBeenCalledWith("w3"),
    );
  });

  it("Delete: a carried-over row says it receives nothing", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([CARRIED]);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Old channel");

    await user.click(
      screen.getByRole("button", { name: "Delete Old channel" }),
    );
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Old channel receives no reports today. Deleting it cannot be undone.",
    );
  });
});
