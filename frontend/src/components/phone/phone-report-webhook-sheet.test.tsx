import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportWebhooksPage } from "@/app/(protected)/admin/report-webhooks/report-webhooks-page";
import type { AdminReportWebhook } from "@/services/types/admin";
import type { User } from "@/services/types/users";
import { pathname } from "@/test/navigation";
import { SAM, renderPhonePage, renderPhoneScreen } from "@/test/phone-screens";

/**
 * v3/AdminWebhook's add and edit sheet on the page's own form: today's zod
 * schema, a blank URL keeps the stored one, only changed fields are sent,
 * at least one badge, the server's refusal in place, and only the masked
 * address ever on screen.
 */

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

// A synthetic address in the server's shape; never a real one.
const NEW_URL =
  "https://discord.com/api/webhooks/000000000000000000/e2e-dummy-token-not-real";

const BASE_HOOK: AdminReportWebhook = {
  id: "w1",
  label: "#base-reports",
  badges: ["borderless_base"],
  webhook_url_masked: "example.invalid/hooks/••••ummy",
  created_at: "2026-10-01T10:00:00Z",
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

function axiosError(status: number, detail: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail } },
  });
}

beforeEach(() => {
  pathname.current = "/admin/report-webhooks";
  mocks.list.mockReset().mockResolvedValue([BASE_HOOK, CARRIED]);
  mocks.create.mockReset();
  mocks.update.mockReset();
  mocks.remove.mockReset();
});

const renderHooks = () =>
  renderPhoneScreen("/admin/report-webhooks", <ReportWebhooksPage />, {
    user: ADMIN,
  });

const card = (id: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="report-webhook-row"][data-webhook-id="${id}"]`,
  )!;

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add webhook" }));
  return screen.findByRole("dialog", { name: "Add webhook" });
}

async function openEdit(
  user: ReturnType<typeof userEvent.setup>,
  id: string,
  name: string,
) {
  await user.click(
    within(card(id)).getByRole("button", { name: `Edit ${name}` }),
  );
  return screen.findByRole("dialog", { name: "Edit webhook" });
}

describe("the webhook sheet below md", () => {
  it("asks for the address, the badges BASE and PSP with their lines, and a label, as the board draws them", async () => {
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");

    const sheet = await openAdd(user);
    expect(sheet).toHaveAccessibleDescription(
      "Reports from members who hold any of the chosen badges are posted through this webhook.",
    );
    expect(sheet.querySelector(".ph-grab")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    const form = sheet.querySelector('form[data-slot="report-webhook-form"]')!;
    expect(form).toHaveAttribute("data-mode", "add");
    expect(form).toHaveClass("ph-scroll", "ph-wh-form");

    const url = within(sheet).getByLabelText("Webhook URL");
    expect(url).toHaveFocus();
    expect(url).toHaveAttribute("type", "url");
    expect(url).toHaveAttribute(
      "placeholder",
      "https://discord.com/api/webhooks/…",
    );
    expect(url).toHaveAccessibleDescription(
      "Only a masked form is shown after saving.",
    );
    expect(url).toHaveClass("ph-input");

    const group = within(sheet).getByRole("group", { name: "Badges" });
    expect(group).toHaveAttribute("data-slot", "report-webhook-badge-options");
    expect(group).toHaveAccessibleDescription(
      "Choose one or both. A report goes to every webhook that holds its member's badge.",
    );
    const options = within(group).getAllByRole("checkbox");
    expect(options.map((o) => o.getAttribute("data-badge"))).toEqual([
      "borderless_base",
      "borderless_psp",
    ]);
    const base = within(group).getByRole("checkbox", { name: "BASE" });
    expect(base).toHaveAttribute("aria-checked", "false");
    expect(base).toHaveAccessibleDescription(
      "Reports from Borderless BASE members.",
    );
    expect(
      within(group).getByRole("checkbox", { name: "PSP" }),
    ).toHaveAccessibleDescription("Reports from Borderless PSP members.");

    const label = within(sheet).getByLabelText("Label");
    expect(label).toHaveAttribute("maxlength", "100");
    expect(label).toHaveAttribute("placeholder", "e.g. BASE reports channel");
    expect(label).toHaveAccessibleDescription(
      "Optional. Up to 100 characters, to tell webhooks apart.",
    );

    const [cancel, save] = within(sheet)
      .getAllByRole("button")
      .filter((b) => b.getAttribute("role") !== "checkbox");
    expect(cancel).toHaveTextContent("Cancel");
    expect(cancel).toHaveClass("ph-btn", "ph-sec");
    expect(save).toHaveTextContent("Save webhook");
    expect(save).toHaveAttribute("type", "submit");
    expect(save).toHaveClass("ph-btn", "ph-pri");

    await user.click(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Add webhook" })).toHaveFocus();
  });

  it("refuses an add without an address or a badge, then an invalid address, in today's words", async () => {
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");
    const sheet = await openAdd(user);

    await user.click(
      within(sheet).getByRole("button", { name: "Save webhook" }),
    );
    expect(
      await within(sheet).findByText("Webhook URL is required"),
    ).toBeInTheDocument();
    const url = within(sheet).getByLabelText("Webhook URL");
    expect(url).toHaveAttribute("aria-invalid", "true");
    expect(url).toHaveAccessibleDescription(
      "Only a masked form is shown after saving. Webhook URL is required",
    );
    expect(
      within(sheet).getByText("Choose at least one badge: BASE or PSP"),
    ).toBeInTheDocument();
    for (const option of within(sheet).getAllByRole("checkbox")) {
      expect(option).toHaveAttribute("aria-invalid", "true");
    }

    await user.type(url, "https://example.com/not-a-webhook");
    await user.click(
      within(sheet).getByRole("button", { name: "Save webhook" }),
    );
    expect(
      await within(sheet).findByText("Invalid Discord webhook URL"),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("adds with the address, BASE and a label, then shows only the masked address", async () => {
    mocks.create.mockResolvedValue({
      ...BASE_HOOK,
      id: "w9",
      label: "phone hooks",
      webhook_url_masked: "discord.com/api/webhooks/••••real",
    });
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");
    const sheet = await openAdd(user);

    await user.type(within(sheet).getByLabelText("Webhook URL"), NEW_URL);
    await user.click(within(sheet).getByRole("checkbox", { name: "BASE" }));
    expect(
      within(sheet).getByRole("checkbox", { name: "BASE" }),
    ).toHaveAttribute("aria-checked", "true");
    await user.type(within(sheet).getByLabelText("Label"), "  phone hooks  ");
    mocks.list.mockResolvedValue([
      BASE_HOOK,
      CARRIED,
      {
        ...BASE_HOOK,
        id: "w9",
        label: "phone hooks",
        webhook_url_masked: "discord.com/api/webhooks/••••real",
      },
    ]);
    await user.click(
      within(sheet).getByRole("button", { name: "Save webhook" }),
    );

    expect(mocks.create).toHaveBeenCalledWith({
      webhook_url: NEW_URL,
      badges: ["borderless_base"],
      label: "phone hooks",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("phone hooks")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("e2e-dummy-token-not-real");
  });

  it("keeps the sheet open on a refusal, with the server's words inside it", async () => {
    mocks.create.mockRejectedValue(
      axiosError(409, "A webhook with this URL already exists"),
    );
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");
    const sheet = await openAdd(user);

    await user.type(within(sheet).getByLabelText("Webhook URL"), NEW_URL);
    await user.click(within(sheet).getByRole("checkbox", { name: "PSP" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Save webhook" }),
    );

    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "report-webhook-form-error");
    expect(refusal).toHaveTextContent("A webhook with this URL already exists");
    expect(screen.getByRole("dialog", { name: "Add webhook" })).toBeVisible();
  });

  it("is busy while it saves: both buttons focusable and refused, Escape does not close", async () => {
    let finish: (row: AdminReportWebhook) => void = () => {};
    mocks.create.mockReturnValue(
      new Promise<AdminReportWebhook>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");
    const sheet = await openAdd(user);

    await user.type(within(sheet).getByLabelText("Webhook URL"), NEW_URL);
    await user.click(within(sheet).getByRole("checkbox", { name: "BASE" }));
    const save = within(sheet).getByRole("button", { name: "Save webhook" });
    await user.click(save);
    await waitFor(() => expect(save).toHaveAttribute("aria-busy", "true"));
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(save).not.toBeDisabled();
    const cancel = within(sheet).getByRole("button", { name: "Cancel" });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    await user.click(save);
    await user.click(cancel);
    await user.keyboard("{Escape}");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Add webhook" })).toBeVisible();

    finish(BASE_HOOK);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("edits with the current masked address shown, a blank URL kept, and only the changed fields sent", async () => {
    mocks.update.mockResolvedValue(BASE_HOOK);
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");

    let sheet = await openEdit(user, "w1", "#base-reports");
    expect(sheet).toHaveAccessibleDescription(
      "Only the fields you change are saved.",
    );
    const url = within(sheet).getByLabelText("Webhook URL");
    expect(url).toHaveValue("");
    expect(url).toHaveAttribute(
      "placeholder",
      "Leave blank to keep the current URL",
    );
    expect(
      sheet.querySelector('[data-slot="report-webhook-url-current"]'),
    ).toHaveTextContent("example.invalid/hooks/••••ummy");
    // Both lines on edit (v3/AdminWebhook l.115-116).
    expect(url).toHaveAccessibleDescription(
      "Current: example.invalid/hooks/••••ummy Only a masked form is shown after saving.",
    );
    expect(within(sheet).getByLabelText("Label")).toHaveValue("#base-reports");
    expect(
      within(sheet).getByRole("checkbox", { name: "BASE" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      within(sheet).getByRole("checkbox", { name: "PSP" }),
    ).toHaveAttribute("aria-checked", "false");

    // Badges only: the set is sent whole; no URL, no label.
    await user.click(within(sheet).getByRole("checkbox", { name: "PSP" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );
    expect(mocks.update).toHaveBeenLastCalledWith("w1", {
      badges: ["borderless_base", "borderless_psp"],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Label only, the URL left blank: the stored one is kept.
    sheet = await openEdit(user, "w1", "#base-reports");
    const label = within(sheet).getByLabelText("Label");
    await user.clear(label);
    await user.type(label, "#base-weekly");
    await user.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );
    expect(mocks.update).toHaveBeenLastCalledWith("w1", {
      label: "#base-weekly",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // A new address only.
    sheet = await openEdit(user, "w1", "#base-reports");
    await user.type(within(sheet).getByLabelText("Webhook URL"), NEW_URL);
    await user.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );
    expect(mocks.update).toHaveBeenLastCalledWith("w1", {
      webhook_url: NEW_URL,
    });
  });

  it("refuses Save on a carried-over webhook until a badge is chosen", async () => {
    mocks.update.mockResolvedValue({ ...CARRIED, badges: ["borderless_psp"] });
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#old");

    const sheet = await openEdit(user, "w3", "#old");
    for (const option of within(sheet).getAllByRole("checkbox")) {
      expect(option).toHaveAttribute("aria-checked", "false");
    }
    await user.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(sheet).findByText("Choose at least one badge: BASE or PSP"),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("group", { name: "Badges" }),
    ).toHaveAccessibleDescription(
      "Choose one or both. A report goes to every webhook that holds its member's badge. Choose at least one badge: BASE or PSP",
    );
    expect(mocks.update).not.toHaveBeenCalled();

    await user.click(within(sheet).getByRole("checkbox", { name: "PSP" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );
    expect(mocks.update).toHaveBeenCalledWith("w3", {
      badges: ["borderless_psp"],
    });
  });

  it("shows an edit the server refused inside the sheet", async () => {
    mocks.update.mockRejectedValue(axiosError(404, "Webhook not found"));
    const user = userEvent.setup();
    await renderHooks();
    await screen.findByText("#base-reports");

    const sheet = await openEdit(user, "w1", "#base-reports");
    await user.click(within(sheet).getByRole("checkbox", { name: "PSP" }));
    await user.click(
      within(sheet).getByRole("button", { name: "Save changes" }),
    );
    expect(await within(sheet).findByRole("alert")).toHaveTextContent(
      "Webhook not found",
    );
  });
});

describe("the webhook sheet across md", () => {
  it("closes a half-filled add sheet when the screen turns past md, and the next add starts blank", async () => {
    const user = userEvent.setup();
    const { viewport } = renderPhonePage(<ReportWebhooksPage />, {
      user: ADMIN,
    });
    await screen.findByText("#base-reports");

    let sheet = await openAdd(user);
    await user.type(within(sheet).getByLabelText("Webhook URL"), NEW_URL);
    await user.click(within(sheet).getByRole("checkbox", { name: "BASE" }));

    viewport.setPhone(false);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      document.querySelector('[data-slot="phone-admin-webhooks"]'),
    ).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();

    // Today's desktop dialog opens blank.
    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    const dialog = await screen.findByRole("dialog", { name: "Add webhook" });
    expect(within(dialog).getByLabelText("Webhook URL")).toHaveValue("");
    expect(dialog).not.toHaveAttribute("data-slot", "phone-sheet");
    expect(dialog.querySelector(".ph-wh-form")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Back on the phone, the sheet opens blank too.
    viewport.setPhone(true);
    sheet = await openAdd(user);
    expect(within(sheet).getByLabelText("Webhook URL")).toHaveValue("");
    expect(
      within(sheet).getByRole("checkbox", { name: "BASE" }),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("closes an open edit sheet when the screen turns past md", async () => {
    const user = userEvent.setup();
    const { viewport } = renderPhonePage(<ReportWebhooksPage />, {
      user: ADMIN,
    });
    await screen.findByText("#base-reports");

    await openEdit(user, "w1", "#base-reports");
    viewport.setPhone(false);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
