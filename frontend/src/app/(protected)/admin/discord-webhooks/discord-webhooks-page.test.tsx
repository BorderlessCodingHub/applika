import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { DiscordWebhooksPage } from "./discord-webhooks-page";
import { services } from "@/services/services";
import type { AdminDiscordWebhook } from "@/services/types/admin";

/**
 * KODI-027 (plan 0009, T146) — the admin Discord webhooks page: the masked
 * list, the zod validation mirroring the server, role-id parsing/dedupe, the
 * edit form's "blank URL keeps the stored one" contract, and the delete
 * confirmation. Pattern: `admin/supports/supports-page.test.tsx` (mock
 * `services`, not the hooks).
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getDiscordWebhooks: vi.fn(),
      createDiscordWebhook: vi.fn(),
      updateDiscordWebhook: vi.fn(),
      deleteDiscordWebhook: vi.fn(),
    },
  },
}));

const ROW: AdminDiscordWebhook = {
  id: "w1",
  label: "Main reports",
  guild_id: "111111111111111111",
  role_ids: ["222222222222222222"],
  webhook_url_masked:
    "https://discord.com/api/webhooks/111111111111111111/…wxyz",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: null,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DiscordWebhooksPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(services.admin.getDiscordWebhooks).mockReset();
  vi.mocked(services.admin.createDiscordWebhook).mockReset();
  vi.mocked(services.admin.updateDiscordWebhook).mockReset();
  vi.mocked(services.admin.deleteDiscordWebhook).mockReset();
});

describe("DiscordWebhooksPage", () => {
  it("shows the loading state, then an empty state with no webhooks", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    renderPage();

    expect(screen.getByText("Loading webhooks")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
  });

  it("renders a masked row and never the full webhook address", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([ROW]);
    const { container } = renderPage();

    await waitFor(() =>
      expect(screen.getByText("Main reports")).toBeInTheDocument(),
    );

    expect(screen.getByText(ROW.webhook_url_masked)).toBeInTheDocument();
    // The real token never appears anywhere on the page (AC9).
    expect(container.textContent).not.toMatch(/wxyz.*wxyz/);
    expect(container.textContent).not.toContain("real-token-should-not-leak");
  });

  it("Add webhook: refuses an empty submit with the server's own messages", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Webhook URL is required"),
    ).toBeInTheDocument();
    expect(screen.getByText("Server id is required")).toBeInTheDocument();
    expect(services.admin.createDiscordWebhook).not.toHaveBeenCalled();
  });

  it("Add webhook: refuses an invalid URL, server id, role id and an over-long label", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://example.com/not-discord",
    );
    await user.type(screen.getByLabelText("Server id"), "not-an-id");
    await user.type(screen.getByLabelText("Role ids"), "also-not-an-id");
    await user.click(screen.getByLabelText("Label"));
    await user.paste("x".repeat(101));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Invalid Discord webhook URL"),
    ).toBeInTheDocument();
    expect(screen.getByText("Invalid Discord server id")).toBeInTheDocument();
    expect(screen.getByText("Invalid Discord role id")).toBeInTheDocument();
    expect(
      screen.getByText("Label must be at most 100 characters"),
    ).toBeInTheDocument();
    expect(services.admin.createDiscordWebhook).not.toHaveBeenCalled();
  });

  it("Add webhook: refuses more than 25 role ids", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    const tooMany = Array.from({ length: 26 }, (_, i) =>
      (BigInt("100000000000000000") + BigInt(i)).toString(),
    ).join(",");
    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.click(screen.getByLabelText("Role ids"));
    await user.paste(tooMany);
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("A webhook may hold at most 25 role ids"),
    ).toBeInTheDocument();
    expect(services.admin.createDiscordWebhook).not.toHaveBeenCalled();
  });

  it("Add webhook: parses, splits and dedupes role ids on submit", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createDiscordWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.type(
      screen.getByLabelText("Role ids"),
      "222222222222222222, 333333333333333333 222222222222222222{enter}444444444444444444",
    );
    await user.type(screen.getByLabelText("Label"), "Main");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(services.admin.createDiscordWebhook).toHaveBeenCalledTimes(1),
    );
    const payload = vi.mocked(services.admin.createDiscordWebhook).mock
      .calls[0][0];
    expect(payload.role_ids).toEqual([
      "222222222222222222",
      "333333333333333333",
      "444444444444444444",
    ]);
    expect(payload.label).toBe("Main");
  });

  it("Add webhook: shows the server's 409 detail inline and keeps the dialog open", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createDiscordWebhook).mockRejectedValue({
      response: {
        status: 409,
        data: { detail: "This webhook is already configured" },
      },
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("This webhook is already configured");
    expect(screen.getByRole("dialog", { name: "Add webhook" })).toBeVisible();
  });

  it("Add webhook: falls back to a fixed message when the server sends no detail string", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createDiscordWebhook).mockRejectedValue({
      response: { status: 500, data: "Internal Server Error" },
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not save the webhook. Try again.",
    );
  });

  it("Add webhook: the server error is cleared when the dialog is reopened", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createDiscordWebhook).mockRejectedValue({
      response: {
        status: 409,
        data: { detail: "This webhook is already configured" },
      },
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Edit webhook: shows the server's 422 detail inline", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.updateDiscordWebhook).mockRejectedValue({
      response: { status: 422, data: { detail: "Invalid Discord server id" } },
    });
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Main reports")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Edit Main reports" }));
    await user.clear(screen.getByLabelText("Server id"));
    await user.type(screen.getByLabelText("Server id"), "999999999999999999");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid Discord server id",
    );
    expect(screen.getByRole("dialog", { name: "Edit webhook" })).toBeVisible();
  });

  it("Add webhook: accepts a server id right at the BIGINT ceiling", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createDiscordWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "9223372036854775807");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(services.admin.createDiscordWebhook).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByText("Invalid Discord server id"),
    ).not.toBeInTheDocument();
  });

  it("Add webhook: refuses a server id one past the BIGINT ceiling", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    // One past the exact BIGINT ceiling (9223372036854775807) — must be
    // refused by a real BigInt comparison, not a string-length heuristic
    // that would also happen to reject any 20-digit value, or a Number()
    // coercion that would silently round-trip this back to the ceiling.
    await user.type(screen.getByLabelText("Server id"), "9223372036854775808");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Invalid Discord server id"),
    ).toBeInTheDocument();
    expect(services.admin.createDiscordWebhook).not.toHaveBeenCalled();
  });

  it("Add webhook: refuses a webhook id past the BIGINT ceiling in the URL", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/99999999999999999999/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Invalid Discord webhook URL"),
    ).toBeInTheDocument();
    expect(services.admin.createDiscordWebhook).not.toHaveBeenCalled();
  });

  it("Add webhook: refuses a role id past the BIGINT ceiling", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    // One past the ceiling, but still 19 digits — within the regex's 17-20
    // digit range, so only a real BigInt comparison (not the regex alone)
    // catches it.
    await user.click(screen.getByLabelText("Role ids"));
    await user.paste("9223372036854775808");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Invalid Discord role id"),
    ).toBeInTheDocument();
    expect(services.admin.createDiscordWebhook).not.toHaveBeenCalled();
  });

  it("Add webhook: accepts a 100-character label made of astral-plane emoji", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createDiscordWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    // Each emoji is a surrogate pair (2 UTF-16 units, 1 code point). 100 of
    // them is exactly the server's own Python len() ceiling; .length in JS
    // would wrongly count 200 and refuse it.
    await user.click(screen.getByLabelText("Label"));
    await user.paste("😀".repeat(100));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(services.admin.createDiscordWebhook).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByText("Label must be at most 100 characters"),
    ).not.toBeInTheDocument();
  });

  it("Add webhook: refuses a plain http:// address", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.type(
      screen.getByLabelText("Webhook URL"),
      "http://discord.com/api/webhooks/111111111111111111/" + "a".repeat(20),
    );
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    expect(
      await screen.findByText("Invalid Discord webhook URL"),
    ).toBeInTheDocument();
    expect(services.admin.createDiscordWebhook).not.toHaveBeenCalled();
  });

  it.each([
    [
      "ptb subdomain",
      "https://ptb.discord.com/api/webhooks/111111111111111111/",
    ],
    [
      "canary + discordapp + /v10",
      "https://canary.discordapp.com/api/v10/webhooks/111111111111111111/",
    ],
    [
      "plain discordapp.com",
      "https://discordapp.com/api/webhooks/111111111111111111/",
    ],
  ])("Add webhook: accepts a %s webhook URL", async (_label, prefix) => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createDiscordWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No webhooks yet")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add webhook" }));

    await user.click(screen.getByLabelText("Webhook URL"));
    await user.paste(prefix + "a".repeat(20));
    await user.type(screen.getByLabelText("Server id"), "111111111111111111");
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(services.admin.createDiscordWebhook).toHaveBeenCalledTimes(1),
    );
    expect(
      screen.queryByText("Invalid Discord webhook URL"),
    ).not.toBeInTheDocument();
  });

  it("shows the error state with Try again, which refetches", async () => {
    vi.mocked(services.admin.getDiscordWebhooks)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce([ROW]);
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByText("Could not load webhooks"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.getByText("Main reports")).toBeInTheDocument(),
    );
  });

  it("Edit: leaving the URL blank omits webhook_url and only sends changed fields", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.updateDiscordWebhook).mockResolvedValue(ROW);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Main reports")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Edit Main reports" }));

    const urlInput = await screen.findByLabelText("Webhook URL");
    expect(urlInput).toHaveValue("");

    const labelInput = screen.getByLabelText("Label");
    await user.clear(labelInput);
    await user.type(labelInput, "Renamed");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(services.admin.updateDiscordWebhook).toHaveBeenCalledTimes(1),
    );
    const [id, payload] = vi.mocked(services.admin.updateDiscordWebhook).mock
      .calls[0];
    expect(id).toBe("w1");
    expect(payload).toEqual({ label: "Renamed" });
    expect(payload.webhook_url).toBeUndefined();
  });

  it("Delete: Cancel does not delete, confirming does", async () => {
    vi.mocked(services.admin.getDiscordWebhooks).mockResolvedValue([ROW]);
    vi.mocked(services.admin.deleteDiscordWebhook).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText("Main reports")).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Delete Main reports" }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(services.admin.deleteDiscordWebhook).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Delete Main reports" }),
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(services.admin.deleteDiscordWebhook).toHaveBeenCalledWith("w1"),
    );
  });
});
