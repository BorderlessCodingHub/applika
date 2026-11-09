import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompaniesPage } from "@/app/(protected)/admin/companies/companies-page";
import { PlatformsPage } from "@/app/(protected)/admin/platforms/platforms-page";
import { catalogUrlLabel } from "@/components/phone/screens/admin-catalog-screen";
import type { User } from "@/services/types/users";
import {
  SAM,
  renderPhoneScreen,
  renderShellAcrossMd,
} from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  publish: vi.fn(),
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

// Both kinds read the same mocks: each test renders one page.
vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getCompanies: mocks.list,
      createCompany: mocks.create,
      updateCompany: mocks.update,
      deleteCompany: mocks.remove,
      publishCompany: mocks.publish,
      getPlatforms: mocks.list,
      createPlatform: mocks.create,
      updatePlatform: mocks.update,
      deletePlatform: mocks.remove,
      publishPlatform: mocks.publish,
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

interface Row {
  id: string;
  name: string;
  url: string | null;
  is_active?: boolean;
  is_public: boolean;
  applications_count: number;
  created_by: { id: string; username: string } | null;
  created_at: string;
}

const USED: Row = {
  id: "r-1",
  name: "Northwind Labs",
  url: "https://northwindlabs.example/",
  is_active: true,
  is_public: true,
  applications_count: 3,
  created_by: { id: "u-1", username: "samcarter" },
  created_at: "2026-10-02T12:00:00Z",
};

const PRIVATE: Row = {
  id: "r-2",
  name: "Pinecone Studio",
  url: null,
  is_active: false,
  is_public: false,
  applications_count: 0,
  created_by: { id: "u-2", username: "mila.costa" },
  created_at: "2026-10-28T12:00:00Z",
};

const LEGACY: Row = {
  id: "r-3",
  name: "Stripe",
  url: "https://stripe.example",
  is_active: true,
  is_public: true,
  applications_count: 1,
  created_by: null,
  created_at: "2025-03-04T12:00:00Z",
};

let totalPages = 1;

function paginated(items: Row[], page = 1) {
  return {
    items,
    total: items.length,
    page,
    per_page: 15,
    total_pages: items.length ? totalPages : 0,
  };
}

const axiosError = (status: number, detail: string) => ({
  isAxiosError: true,
  response: { status, data: { detail } },
});

beforeEach(() => {
  totalPages = 1;
  mocks.list
    .mockReset()
    .mockImplementation((params?: { search?: string; page?: number }) =>
      Promise.resolve(
        params?.search === "zzz"
          ? paginated([])
          : paginated([USED, PRIVATE, LEGACY], params?.page),
      ),
    );
  mocks.create.mockReset().mockResolvedValue({ ...PRIVATE, id: "r-9" });
  mocks.update.mockReset().mockResolvedValue(USED);
  mocks.remove.mockReset().mockResolvedValue(undefined);
  mocks.publish.mockReset().mockResolvedValue({ ...PRIVATE, is_public: true });
});

const KINDS = [
  {
    kind: "company",
    path: "/admin/companies",
    page: <CompaniesPage />,
    add: "Add Company",
    edit: "Edit Company",
    search: "Search companies",
    placeholder: "Search companies...",
    count: "3 companies",
    noMatch: "No companies match your search.",
    empty: "No companies yet.",
    pages: "Company pages",
    urlLabel: "URL",
  },
  {
    kind: "platform",
    path: "/admin/platforms",
    page: <PlatformsPage />,
    add: "Add Platform",
    edit: "Edit Platform",
    search: "Search platforms",
    placeholder: "Search platforms...",
    count: "3 platforms",
    noMatch: "No platforms match your search.",
    empty: "No platforms yet.",
    pages: "Platform pages",
    urlLabel: "URL (optional)",
  },
] as const;

const renderKind = (path: string, page: ReactNode) =>
  renderPhoneScreen(path, page, { user: ADMIN });

const card = (id: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="catalog-row"][data-catalog-id="${id}"]`,
  )!;

const lastParams = () =>
  mocks.list.mock.calls.at(-1)?.[0] as Record<string, unknown> | undefined;

describe("catalogUrlLabel", () => {
  it("drops the scheme and a closing slash, as the board's link text", () => {
    expect(catalogUrlLabel("https://northwindlabs.example/")).toBe(
      "northwindlabs.example",
    );
    expect(catalogUrlLabel("http://linkedin.com/company/google")).toBe(
      "linkedin.com/company/google",
    );
  });
});

describe.each(KINDS)("the admin $kind board below md", (k) => {
  it("draws search, the visibility seg, the count, Add and one card per row", async () => {
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    const board = document.querySelector('[data-slot="phone-admin-catalog"]')!;
    expect(board).toHaveAttribute("data-kind", k.kind);
    expect(board).toHaveClass("ph-app", "ph-ad-body", "ph-ad-list");

    const search = screen.getByRole("searchbox", { name: k.search });
    expect(search).toHaveAttribute("placeholder", k.placeholder);
    expect(search).toHaveClass("ph-input", "ph-cat-search-input");

    const seg = screen.getByRole("group", { name: "Visibility" });
    expect(seg).toHaveAttribute("data-slot", "visibility-filter");
    expect(seg).toHaveClass("ph-seg", "ph-cat-seg");
    expect(
      within(seg)
        .getAllByRole("button")
        .map((b) => [b.textContent, b.getAttribute("aria-pressed")]),
    ).toEqual([
      ["All", "true"],
      ["Public", "false"],
      ["Private", "false"],
    ]);

    expect(
      document.querySelector('[data-slot="catalog-count"]'),
    ).toHaveTextContent(k.count);
    const add = screen.getByRole("button", { name: k.add });
    expect(add).toHaveClass("ph-btn", "ph-pri", "ph-sm");
    expect(add).toHaveAttribute("aria-haspopup", "dialog");

    const used = card("r-1");
    expect(used).toHaveClass("ph-card", "ph-cat-row");
    expect(within(used).getByText("Northwind Labs")).toHaveClass("ph-cat-name");
    expect(within(used).queryByText("Private")).not.toBeInTheDocument();
    const link = within(used).getByRole("link", {
      name: "northwindlabs.example (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://northwindlabs.example/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveClass("ph-hit", "ph-cat-url");
    expect(used.querySelector('[data-slot="catalog-meta"]')).toHaveTextContent(
      "Added by samcarter · 3 apps · Created Oct 2, 2026",
    );
    expect(
      within(used).queryByRole("button", { name: /^Approve/ }),
    ).not.toBeInTheDocument();
    expect(
      within(used).getByRole("button", { name: "Edit Northwind Labs" }),
    ).toHaveTextContent("Edit");
    expect(
      within(used).getByRole("button", { name: "Delete Northwind Labs" }),
    ).toHaveTextContent("Delete");

    const priv = card("r-2");
    expect(priv).toHaveAttribute("data-private", "true");
    expect(within(priv).getByText("Private").closest(".ph-pill")).toHaveClass(
      "ph-warn",
    );
    const noUrl = priv.querySelector('[data-slot="catalog-url"]')!;
    expect(noUrl.tagName).toBe("SPAN");
    expect(noUrl).toHaveTextContent("—No URL");
    expect(noUrl.querySelector('[aria-hidden="true"]')).toHaveTextContent("—");
    expect(priv.querySelector('[data-slot="catalog-meta"]')).toHaveTextContent(
      "Added by mila.costa · 0 apps · Created Oct 28, 2026",
    );
    const approve = within(priv).getByRole("button", {
      name: "Approve Pinecone Studio",
    });
    expect(approve).toHaveTextContent(/^Approve$/);

    // One application: "1 app"; no creator: a dash read as "Not recorded".
    const legacy = card("r-3");
    const meta = legacy.querySelector('[data-slot="catalog-meta"]')!;
    expect(meta).toHaveTextContent(
      "Added by —Not recorded · 1 app · Created Mar 4, 2025",
    );
    expect(meta.querySelector(".ph-sr")).toHaveTextContent("Not recorded");

    // One page: no pages control.
    expect(document.querySelector('[data-slot="phone-pager"]')).toBeNull();
  });

  it("presses the picked visibility and asks for it from the first page", async () => {
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    const seg = screen.getByRole("group", { name: "Visibility" });
    await user.click(within(seg).getByRole("button", { name: "Private" }));
    expect(
      within(seg).getByRole("button", { name: "Private" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(seg).getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ visibility: "private", page: 1 }),
    );
  });

  it("announces Delete unavailable on a used row, focusable, with its reason", async () => {
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    const used = card("r-1");
    expect(used).toHaveAttribute("data-used", "true");
    const del = within(used).getByRole("button", {
      name: "Delete Northwind Labs",
    });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).not.toHaveAttribute("disabled");
    expect(del).toHaveAccessibleDescription(
      "Cannot delete: used by applications",
    );
    expect(
      used.querySelector('[data-slot="catalog-delete-reason"]'),
    ).toHaveClass("ph-hint");

    del.focus();
    expect(del).toHaveFocus();
    await user.click(del);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.remove).not.toHaveBeenCalled();

    // An unused row's Delete opens its sheet.
    expect(
      within(card("r-2")).getByRole("button", {
        name: "Delete Pinecone Studio",
      }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("approves in a sheet that says what changes, keeping it open on the server's words", async () => {
    mocks.publish
      .mockReset()
      .mockRejectedValueOnce(
        axiosError(
          409,
          "A public row named Pinecone Studio already exists: r-7",
        ),
      )
      .mockResolvedValueOnce({ ...PRIVATE, is_public: true });
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    await user.click(
      screen.getByRole("button", { name: "Approve Pinecone Studio" }),
    );
    const sheet = await screen.findByRole("alertdialog", {
      name: "Approve Pinecone Studio?",
    });
    expect(
      within(sheet).getByText(
        `Pinecone Studio becomes public: every user sees it in their ${k.kind} list and can pick it.`,
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText("It keeps mila.costa as the user who added it."),
    ).toHaveClass("ph-cat-muted");
    expect(
      within(sheet).getByText("It cannot be made private again."),
    ).toHaveClass("ph-cat-muted");
    const cancel = within(sheet).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toHaveFocus());

    await user.click(within(sheet).getByRole("button", { name: "Approve" }));
    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "approve-catalog-error");
    expect(refusal).toHaveTextContent(
      "A public row named Pinecone Studio already exists: r-7",
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mocks.publish).toHaveBeenCalledTimes(2);
    expect(mocks.publish).toHaveBeenLastCalledWith("r-2");
  });

  it("deletes in a sheet, showing a refusal inside it", async () => {
    mocks.remove
      .mockReset()
      .mockRejectedValueOnce(axiosError(409, "It is still in use."))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    await user.click(
      screen.getByRole("button", { name: "Delete Pinecone Studio" }),
    );
    const sheet = await screen.findByRole("alertdialog", {
      name: "Delete Pinecone Studio",
    });
    expect(within(sheet).getByText("This cannot be undone.")).toHaveClass(
      "ph-hint",
      "ph-cat-undone",
    );
    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "catalog-delete-error");
    expect(refusal).toHaveTextContent("It is still in use.");

    await user.click(within(sheet).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mocks.remove).toHaveBeenLastCalledWith("r-2");
  });

  it("adds in a sheet: today's validation inline, the server's refusal inside it", async () => {
    mocks.create
      .mockReset()
      .mockRejectedValueOnce(axiosError(409, "That name is taken."))
      .mockResolvedValueOnce({ ...PRIVATE, id: "r-9" });
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    await user.click(screen.getByRole("button", { name: k.add }));
    const sheet = await screen.findByRole("dialog", { name: k.add });
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    await waitFor(() => expect(name).toHaveFocus());
    const url = within(sheet).getByRole("textbox", { name: k.urlLabel });
    expect(url).toHaveAttribute("placeholder", "https://...");

    await user.click(within(sheet).getByRole("button", { name: "Create" }));
    expect(await within(sheet).findByText("Name is required")).toBeVisible();
    if (k.kind === "company") {
      expect(within(sheet).getByText("Must be a valid URL")).toBeVisible();
      expect(url).toHaveAttribute("type", "url");
      expect(url).toBeRequired();
    } else {
      expect(url).toHaveAttribute("maxLength", "200");
      expect(name).toHaveAttribute("maxLength", "100");
    }
    expect(mocks.create).not.toHaveBeenCalled();

    await user.type(name, "Acme Labs");
    await user.type(url, "https://acme.example");
    await user.click(within(sheet).getByRole("button", { name: "Create" }));
    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "catalog-form-error");
    expect(refusal).toHaveTextContent("That name is taken.");
    expect(mocks.create).toHaveBeenCalledWith({
      name: "Acme Labs",
      url: "https://acme.example",
    });

    // Cancelled and opened again: the refusal is gone, what was typed stays (today's form).
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: k.add }));
    const reopened = await screen.findByRole("dialog", { name: k.add });
    expect(within(reopened).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(reopened).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Acme Labs",
    );

    await user.click(within(reopened).getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    // Opened again: an empty form, no old refusal.
    await user.click(screen.getByRole("button", { name: k.add }));
    const again = await screen.findByRole("dialog", { name: k.add });
    expect(within(again).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
    expect(within(again).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("edits in a sheet, showing the server's refusal inside it", async () => {
    mocks.update
      .mockReset()
      .mockRejectedValueOnce(axiosError(409, "That name is taken."))
      .mockResolvedValueOnce(USED);
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    const open = screen.getByRole("button", { name: "Edit Northwind Labs" });
    await user.click(open);
    const sheet = await screen.findByRole("dialog", { name: k.edit });
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "catalog-form-error");
    expect(refusal).toHaveTextContent("That name is taken.");
    expect(screen.getByRole("dialog", { name: k.edit })).toBeInTheDocument();

    // Cancelled and opened again: the refusal is gone.
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await user.click(open);
    const reopened = await screen.findByRole("dialog", { name: k.edit });
    expect(within(reopened).queryByRole("alert")).not.toBeInTheDocument();

    await user.click(within(reopened).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(mocks.update).toHaveBeenCalledTimes(2);

    // Opened again: no old refusal.
    await user.click(open);
    const again = await screen.findByRole("dialog", { name: k.edit });
    expect(within(again).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("edits in a sheet filled with the row, and Cancel closes it", async () => {
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    const open = screen.getByRole("button", { name: "Edit Northwind Labs" });
    await user.click(open);
    const sheet = await screen.findByRole("dialog", { name: k.edit });
    const name = within(sheet).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Northwind Labs");
    expect(
      within(sheet).getByRole("textbox", { name: k.urlLabel }),
    ).toHaveValue("https://northwindlabs.example/");

    await user.clear(name);
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await within(sheet).findByText("Name is required")).toBeVisible();
    expect(mocks.update).not.toHaveBeenCalled();

    await user.type(name, "Northwind");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith("r-1", {
        name: "Northwind",
        url: "https://northwindlabs.example/",
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(open).toHaveFocus();

    await user.click(open);
    const again = await screen.findByRole("dialog", { name: k.edit });
    await user.click(within(again).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("says nothing matches in its own words, and a cleared search shows the list at once", async () => {
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    const search = screen.getByRole("searchbox", { name: k.search });
    await user.type(search, "zzz");
    const none = await screen.findByText(k.noMatch);
    expect(none).toHaveAttribute("data-slot", "catalog-empty");
    expect(none).toHaveAttribute("data-reason", "no-match");

    await user.clear(search);
    expect(screen.getByText("Northwind Labs")).toBeInTheDocument();
    expect(screen.queryByText(k.noMatch)).not.toBeInTheDocument();
  });

  it("says there is nothing yet on an empty list", async () => {
    mocks.list.mockReset().mockResolvedValue(paginated([]));
    await renderKind(k.path, k.page);

    const empty = await screen.findByText(k.empty);
    expect(empty).toHaveAttribute("data-reason", "empty");
  });

  it("pages under the list, named as today", async () => {
    totalPages = 2;
    const user = userEvent.setup();
    await renderKind(k.path, k.page);
    await screen.findByText("Northwind Labs");

    const pager = screen.getByRole("navigation", { name: k.pages });
    expect(within(pager).getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(within(pager).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
    expect(
      within(pager).getByRole("button", { name: "Next page" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});

describe("the company board's status", () => {
  it("shows active or inactive and a switch that turns the company on or off", async () => {
    let finish: () => void = () => {};
    mocks.update
      .mockReset()
      .mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    await renderKind("/admin/companies", <CompaniesPage />);
    await screen.findByText("Northwind Labs");

    const on = card("r-1");
    expect(within(on).getByText("active").closest(".ph-pill")).toHaveClass(
      "ph-ok",
    );
    const off = card("r-2");
    expect(
      within(off).getByText("inactive").closest(".ph-pill"),
    ).not.toHaveClass("ph-ok");
    expect(
      within(off).getByRole("switch", {
        name: "Toggle status for Pinecone Studio",
      }),
    ).toHaveAttribute("aria-checked", "false");

    const toggle = within(on).getByRole("switch", {
      name: "Toggle status for Northwind Labs",
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(mocks.update).toHaveBeenCalledWith("r-1", { is_active: false });
    await waitFor(() => expect(toggle).toHaveAttribute("aria-busy", "true"));
    expect(toggle).toHaveAttribute("aria-disabled", "true");
    await user.click(toggle);
    expect(mocks.update).toHaveBeenCalledTimes(1);

    // A status change in flight is not an Edit save, and opening Edit
    // keeps the switch pending.
    await user.click(
      within(on).getByRole("button", { name: "Edit Northwind Labs" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit Company" });
    expect(
      within(sheet).getByRole("button", { name: "Save" }),
    ).not.toHaveAttribute("aria-busy");
    expect(toggle).toHaveAttribute("aria-busy", "true");
    finish();
    await waitFor(() => expect(toggle).not.toHaveAttribute("aria-busy"));
  });

  it("keeps a status change refused while Edit is open out of the sheet", async () => {
    let fail: (error: unknown) => void = () => {};
    mocks.update
      .mockReset()
      .mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    const user = userEvent.setup();
    await renderKind("/admin/companies", <CompaniesPage />);
    await screen.findByText("Northwind Labs");

    const on = card("r-1");
    const toggle = within(on).getByRole("switch", {
      name: "Toggle status for Northwind Labs",
    });
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-busy", "true"));
    await user.click(
      within(on).getByRole("button", { name: "Edit Northwind Labs" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit Company" });

    fail(axiosError(409, "Status refused."));
    await waitFor(() => expect(toggle).not.toHaveAttribute("aria-busy"));
    expect(sheet.querySelector('[data-slot="catalog-form-error"]')).toBeNull();
    expect(
      within(sheet).getByRole("button", { name: "Save" }),
    ).not.toHaveAttribute("aria-busy");
  });

  it("keeps a refused status change out of the Edit sheet", async () => {
    mocks.update
      .mockReset()
      .mockRejectedValueOnce(axiosError(409, "Status refused."));
    const user = userEvent.setup();
    await renderKind("/admin/companies", <CompaniesPage />);
    await screen.findByText("Northwind Labs");

    const on = card("r-1");
    const toggle = within(on).getByRole("switch", {
      name: "Toggle status for Northwind Labs",
    });
    await user.click(toggle);
    await waitFor(() => expect(toggle).not.toHaveAttribute("aria-busy"));

    await user.click(
      within(on).getByRole("button", { name: "Edit Northwind Labs" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit Company" });
    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    expect(sheet.querySelector('[data-slot="catalog-form-error"]')).toBeNull();
  });

  it("draws no status and no switch on platforms", async () => {
    await renderKind("/admin/platforms", <PlatformsPage />);
    await screen.findByText("Northwind Labs");
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("active")).not.toBeInTheDocument();
  });
});

describe("the catalog boards across md", () => {
  it("closes a half-filled Add sheet when the screen turns past md, and loses what was typed", async () => {
    const user = userEvent.setup();
    const { viewport } = renderShellAcrossMd(
      "/admin/companies",
      <CompaniesPage />,
      { user: ADMIN },
    );
    await screen.findByText("Northwind Labs");

    await user.click(screen.getByRole("button", { name: "Add Company" }));
    const sheet = await screen.findByRole("dialog", { name: "Add Company" });
    await user.type(
      within(sheet).getByRole("textbox", { name: "Name" }),
      "Half typed",
    );

    viewport.setPhone(false);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    // Today's desktop page, its table and its own h1.
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Company Management",
      }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="phone-admin-catalog"]'),
    ).toBeNull();

    viewport.setPhone(true);
    await user.click(
      await screen.findByRole("button", { name: "Add Company" }),
    );
    const again = await screen.findByRole("dialog", { name: "Add Company" });
    expect(within(again).getByRole("textbox", { name: "Name" })).toHaveValue(
      "",
    );
  });
});

describe("long names", () => {
  it("end a long name and URL in an ellipsis, the pills and switch keep their size", async () => {
    const long =
      "An Extraordinarily Long Company Name That Would Never Fit On One Phone Row";
    mocks.list.mockReset().mockResolvedValue(
      paginated([
        {
          ...PRIVATE,
          name: long,
          url: `https://${"very-long-subdomain.".repeat(4)}example/path`,
        },
      ]),
    );
    await renderKind("/admin/companies", <CompaniesPage />);

    expect(await screen.findByText(long)).toHaveClass("ph-cat-name");
    const row = card("r-2");
    expect(row.querySelector(".ph-cat-url-text")).not.toBeNull();
    expect(row.querySelector(".ph-cat-title")).toContainElement(
      within(row).getByText("Private"),
    );
  });
});
