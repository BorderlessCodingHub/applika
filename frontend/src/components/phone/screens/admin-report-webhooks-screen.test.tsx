import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportWebhooksPage } from "@/app/(protected)/admin/report-webhooks/report-webhooks-page";
import type { AdminReportWebhook } from "@/services/types/admin";
import type { User } from "@/services/types/users";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: ADMIN, isLoading: false, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/admin/report-webhooks";
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getReportWebhooks: mocks.list,
      createReportWebhook: mocks.create,
      updateReportWebhook: mocks.update,
      deleteReportWebhook: mocks.remove,
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

// Synthetic, masked addresses only: the server never sends the secret back.
const BASE_HOOK: AdminReportWebhook = {
  id: "w1",
  label: "#base-reports",
  badges: ["borderless_base"],
  webhook_url_masked: "example.invalid/hooks/••••ummy",
  created_at: "2026-10-01T10:00:00Z",
  updated_at: null,
};
const BOTH_HOOK: AdminReportWebhook = {
  id: "w2",
  label: null,
  badges: ["borderless_base", "borderless_psp"],
  webhook_url_masked: "example.invalid/hooks/••••a71c",
  created_at: "2026-10-02T10:00:00Z",
  updated_at: null,
};
const CARRIED: AdminReportWebhook = {
  id: "w3",
  label: "#old",
  badges: [],
  webhook_url_masked: "example.invalid/hooks/••••0000",
  created_at: "2026-09-01T10:00:00Z",
  updated_at: null,
};

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([BASE_HOOK, BOTH_HOOK, CARRIED]);
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

const renderHooks = () =>
  renderPhoneScreen("/admin/report-webhooks", <ReportWebhooksPage />, {
    user: ADMIN,
  });

const card = (id: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="report-webhook-row"][data-webhook-id="${id}"]`,
  )!;

describe("the admin Report webhooks board below md", () => {
  it("draws one card per webhook: label, badge pills and the masked address only", async () => {
    await renderHooks();
    await screen.findByText("#base-reports");

    expect(
      screen.getByRole("heading", { level: 2, name: "Report webhooks" }),
    ).toHaveClass("ph-sr");
    expect(
      screen.getByText(
        "Each webhook holds one or more badges. A member's biweekly report is posted to every webhook that holds their badge.",
      ),
    ).toHaveClass("ph-hint");

    const base = card("w1");
    expect(base).toHaveAttribute("data-badges", "borderless_base");
    expect(base).toHaveClass("ph-card", "ph-ad-hook");
    expect(
      Array.from(
        base.querySelectorAll('[data-slot="report-webhook-badge"]'),
      ).map((pill) => pill.textContent),
    ).toEqual(["BASE"]);
    const url = base.querySelector('[data-slot="report-webhook-url"]')!;
    expect(url).toHaveTextContent("example.invalid/hooks/••••ummy");
    expect(url).toHaveClass("ph-mono", "ph-ad-hook-url");

    const both = card("w2");
    expect(both).toHaveAttribute(
      "data-badges",
      "borderless_base borderless_psp",
    );
    expect(within(both).getByText("Unlabelled webhook")).toBeInTheDocument();
    expect(
      Array.from(
        both.querySelectorAll('[data-slot="report-webhook-badge"]'),
      ).map((pill) => pill.textContent),
    ).toEqual(["BASE", "PSP"]);

    const carried = card("w3");
    expect(carried).toHaveAttribute("data-badges", "none");
    expect(
      within(carried).getByText("No badge, receives nothing"),
    ).toBeInTheDocument();

    // Only the masked form ever reaches the page.
    const board = document.querySelector('[data-slot="phone-admin-webhooks"]')!;
    expect(board.textContent).not.toMatch(/https?:\/\//);
    expect(board.querySelector("a[href]")).toBeNull();
    expect(screen.getByRole("button", { name: "Add webhook" })).toHaveAttribute(
      "data-action",
      "add-webhook",
    );
  });

  it("opens today's add and edit dialogs", async () => {
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");

    await user.click(
      within(card("w1")).getByRole("button", {
        name: "Edit #base-reports",
      }),
    );
    expect(
      screen.getByRole("dialog", { name: "Edit webhook" }),
    ).toHaveTextContent("example.invalid/hooks/••••ummy");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    expect(
      screen.getByRole("dialog", { name: "Add webhook" }),
    ).toBeInTheDocument();
  });

  it("deletes after its sheet; Cancel first, focus to Add webhook once the card is gone", async () => {
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");

    const remove = within(card("w1")).getByRole("button", {
      name: "Delete #base-reports",
    });
    await user.click(remove);
    let sheet = screen.getByRole("alertdialog", { name: "Delete webhook?" });
    const [cancel, confirm] = within(sheet).getAllByRole("button");
    expect(cancel).toHaveTextContent("Cancel");
    expect(cancel).toHaveFocus();
    expect(confirm).toHaveTextContent("Delete");
    await user.click(cancel);
    expect(remove).toHaveFocus();
    expect(mocks.remove).not.toHaveBeenCalled();

    mocks.list.mockResolvedValue([BOTH_HOOK, CARRIED]);
    await user.click(remove);
    sheet = screen.getByRole("alertdialog");
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));

    expect(mocks.remove).toHaveBeenCalledWith("w1");
    await waitFor(() =>
      expect(
        document.querySelector('[data-webhook-id="w1"]'),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add webhook" })).toHaveFocus(),
    );
  });

  it("says there is no webhook yet, and shows a failure with Retry", async () => {
    mocks.list
      .mockReset()
      .mockRejectedValueOnce({
        response: { status: 500, data: { detail: "Webhooks are down" } },
      })
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    await renderHooks();

    expect(await screen.findByText("Webhooks are down")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No webhooks yet")).toBeInTheDocument();
  });

  it("renders today's list at md and up, and swaps when the width crosses md", async () => {
    const { viewport } = renderPhonePage(<ReportWebhooksPage />, {
      user: ADMIN,
    });
    await screen.findByText("#base-reports");
    expect(
      document.querySelector('[data-slot="phone-admin-webhooks"]'),
    ).not.toBeNull();

    viewport.setPhone(false);

    expect(
      document.querySelector('[data-slot="phone-admin-webhooks"]'),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Report webhooks" }),
    ).toBeInTheDocument();
  });
});
