import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminLayout from "@/app/(protected)/admin/layout";
import { ReportWebhooksPage } from "@/app/(protected)/admin/report-webhooks/report-webhooks-page";
import type { AdminReportWebhook } from "@/services/types/admin";
import type { User } from "@/services/types/users";
import { pathname } from "@/test/navigation";
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
  const { navigationMock } = await import("@/test/navigation");
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
  pathname.current = "/admin/report-webhooks";
  mocks.list.mockReset().mockResolvedValue([BASE_HOOK, BOTH_HOOK, CARRIED]);
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

const renderHooks = () =>
  renderPhoneScreen(
    "/admin/report-webhooks",
    <AdminLayout>
      <ReportWebhooksPage />
    </AdminLayout>,
    { user: ADMIN },
  );

const card = (id: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="report-webhook-row"][data-webhook-id="${id}"]`,
  )!;

const pills = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll('[data-slot="report-webhook-badge"]'),
    (pill) => pill.textContent,
  );

describe("the admin Report webhooks board below md", () => {
  it("heads itself Report webhooks with its lead above the chips, no Admin Console", async () => {
    await renderHooks();

    expect(
      screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent),
    ).toEqual(["Report webhooks"]);
    expect(
      screen.getByRole("heading", { level: 1, name: "Report webhooks" }),
    ).toHaveClass("ph-h1", "ph-h1-26");
    expect(
      screen.getByText(
        "Each webhook holds one or more badges. A member's biweekly report is posted to every webhook that holds their BASE or PSP badge.",
      ),
    ).toHaveClass("ph-lead");
    expect(screen.queryByText("Admin Console")).toBeNull();
    // 0021's visually hidden h2 is gone: the header heads the section.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("draws one card per webhook: label, Edit, Delete, badges or none, the masked address, then Add webhook", async () => {
    await renderHooks();
    await screen.findByText("#base-reports");

    const list = document.querySelector('[data-slot="report-webhooks"]')!;
    expect(list.tagName).toBe("UL");
    expect(list).toHaveClass("ph-wh-list");

    const base = card("w1");
    expect(base).toHaveClass("ph-card", "ph-wh-card");
    expect(base).toHaveAttribute("data-badges", "borderless_base");
    expect(within(base).getByText("#base-reports")).toHaveClass("ph-wh-label");
    const edit = within(base).getByRole("button", {
      name: "Edit #base-reports",
    });
    expect(edit).toHaveClass("ph-iconbtn", "ph-flat");
    expect(edit).toHaveAttribute("data-action", "edit-webhook");
    expect(edit).toHaveAttribute("aria-haspopup", "dialog");
    const remove = within(base).getByRole("button", {
      name: "Delete #base-reports",
    });
    expect(remove).toHaveClass("ph-iconbtn", "ph-flat", "ph-wh-del");
    expect(remove).toHaveAttribute("data-action", "delete-webhook");
    const facts = base.querySelector("dl")!;
    expect(facts).toHaveClass("ph-wh-dl");
    expect(
      Array.from(facts.querySelectorAll("dt"), (term) => term.textContent),
    ).toEqual(["Badges", "Webhook"]);
    expect(pills(base)).toEqual(["BASE"]);
    expect(
      base.querySelector('[data-slot="report-webhook-badge"]'),
    ).toHaveClass("ph-pill", "ph-pri");
    const url = base.querySelector('[data-slot="report-webhook-url"]')!;
    expect(url).toHaveTextContent("example.invalid/hooks/••••ummy");
    expect(url).toHaveClass("ph-mono", "ph-wh-url");

    const both = card("w2");
    expect(both).toHaveAttribute(
      "data-badges",
      "borderless_base borderless_psp",
    );
    const unlabelled = within(both).getByText("Unlabelled webhook");
    expect(unlabelled).toHaveAttribute("data-unlabelled");
    expect(pills(both)).toEqual(["BASE", "PSP"]);
    expect(
      within(both).getByRole("button", { name: "Edit unlabelled webhook" }),
    ).toBeInTheDocument();

    const carried = card("w3");
    expect(carried).toHaveAttribute("data-badges", "none");
    expect(within(carried).getByText("No badge, receives nothing")).toHaveClass(
      "ph-wh-none",
    );
    expect(pills(carried)).toEqual([]);

    // Only the masked form ever reaches the page.
    const board = document.querySelector('[data-slot="phone-admin-webhooks"]')!;
    expect(board.textContent).not.toMatch(/https?:\/\//);
    expect(board.querySelector("a[href]")).toBeNull();
    const add = screen.getByRole("button", { name: "Add webhook" });
    expect(add).toHaveAttribute("data-action", "add-webhook");
    expect(add).toHaveClass("ph-btn", "ph-pri");
    expect(add).toHaveAttribute("aria-haspopup", "dialog");
    // Add webhook follows the cards.
    expect(
      list.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("deletes after its sheet: Cancel first, its words, focus to Add webhook once the card is gone", async () => {
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");

    const remove = within(card("w1")).getByRole("button", {
      name: "Delete #base-reports",
    });
    await user.click(remove);
    let sheet = await screen.findByRole("alertdialog", {
      name: "Delete webhook?",
    });
    expect(sheet).toHaveAccessibleDescription(
      "Reports from Borderless BASE members will no longer be posted to #base-reports. This cannot be undone.",
    );
    const [cancel, confirm] = within(sheet).getAllByRole("button");
    expect(cancel).toHaveTextContent("Cancel");
    expect(cancel).toHaveClass("ph-btn", "ph-sec");
    expect(cancel).toHaveFocus();
    expect(confirm).toHaveTextContent("Delete");
    expect(confirm).toHaveClass("ph-btn", "ph-dan");
    expect(confirm).toHaveAttribute("data-action", "confirm-delete-webhook");
    await user.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(remove).toHaveFocus();
    expect(mocks.remove).not.toHaveBeenCalled();

    let finish: () => void = () => {};
    mocks.remove.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    await user.click(remove);
    sheet = await screen.findByRole("alertdialog");
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    expect(mocks.remove).toHaveBeenCalledWith("w1");
    // While its DELETE runs the card dims; Edit and Delete stay focusable.
    await waitFor(() =>
      expect(card("w1")).toHaveAttribute("data-deleting", "true"),
    );
    expect(card("w1")).toHaveAttribute("aria-busy", "true");
    expect(
      within(card("w1")).getByRole("button", { name: "Edit #base-reports" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAttribute("aria-busy", "true");
    await user.click(remove);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Edit is refused on the row whose DELETE runs.
    await user.click(
      within(card("w1")).getByRole("button", { name: "Edit #base-reports" }),
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    mocks.list.mockResolvedValue([BOTH_HOOK, CARRIED]);
    finish();
    await waitFor(() =>
      expect(
        document.querySelector('[data-webhook-id="w1"]'),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add webhook" })).toHaveFocus(),
    );
  });

  it("words a carried-over webhook's delete as receiving nothing", async () => {
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#old");

    await user.click(
      within(card("w3")).getByRole("button", { name: "Delete #old" }),
    );
    expect(
      await screen.findByRole("alertdialog", { name: "Delete webhook?" }),
    ).toHaveAccessibleDescription(
      "#old receives no reports today. Deleting it cannot be undone.",
    );
  });

  it("says there is no webhook yet", async () => {
    mocks.list.mockReset().mockResolvedValue([]);
    await renderHooks();

    const empty = await waitFor(() => {
      const found = document.querySelector(
        '[data-slot="report-webhooks-empty"]',
      );
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(empty).toHaveClass("ph-card", "ph-state-card");
    expect(within(empty).getByText("No webhooks yet")).toBeInTheDocument();
    expect(
      within(empty).getByText(
        "Reports are saved but not posted anywhere until a webhook is added for BASE or PSP.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add webhook" }),
    ).toBeInTheDocument();
  });

  it("shows a failed load in today's words with Try again, then the list", async () => {
    mocks.list
      .mockReset()
      .mockRejectedValueOnce({
        response: { status: 500, data: { detail: "Webhooks are down" } },
      })
      .mockResolvedValueOnce([BASE_HOOK]);
    const user = userEvent.setup();
    await renderHooks();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("data-slot", "report-webhooks-error");
    expect(alert).toHaveClass("ph-card", "ph-alert-card");
    expect(
      within(alert).getByText("Could not load webhooks"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText(
        "The list did not load. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    // The board's words, not the API's (P28).
    expect(screen.queryByText("Webhooks are down")).toBeNull();
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("#base-reports")).toBeInTheDocument();
  });

  it("ends a long label in an ellipsis, the controls keep their size", async () => {
    const long =
      "#a-channel-label-far-too-long-for-one-phone-row-with-two-icon-buttons";
    mocks.list.mockReset().mockResolvedValue([{ ...BASE_HOOK, label: long }]);
    await renderHooks();

    expect(await screen.findByText(long)).toHaveClass("ph-wh-label");
    expect(screen.getByRole("button", { name: `Edit ${long}` })).toHaveClass(
      "ph-iconbtn",
    );
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
