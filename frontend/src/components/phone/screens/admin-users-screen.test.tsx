import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsersPage } from "@/app/(protected)/admin/users/users-page";
import type {
  AdminUserDetail,
  AdminUserRow,
  AdminUsersParams,
} from "@/services/types/admin";
import type { User } from "@/services/types/users";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: ADMIN, isLoading: false, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock, pathname } = await import("@/test/navigation");
  pathname.current = "/admin/users";
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getUsers: mocks.list,
      getUser: mocks.detail,
      updateUser: mocks.update,
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const SAMC: AdminUserRow = {
  id: "u-sam",
  username: "samcarter",
  email: "sam@carter.dev",
  github_id: null,
  seniority_level: "senior",
  is_admin: false,
  total_applications: 34,
  offers: 2,
  denials: 9,
  active_applications: 12,
  last_activity: ago(1),
  joined_at: ago(3),
};

const PRIYA: AdminUserRow = {
  id: "u-priya",
  username: "priya.n",
  email: "priya@applika.example",
  github_id: 4242,
  is_admin: true,
  total_applications: 8,
  offers: 1,
  denials: 2,
  active_applications: 3,
  last_activity: ago(2),
  joined_at: ago(124),
};

const SAM_DETAIL: AdminUserDetail = {
  ...SAMC,
  first_name: "Sam",
  last_name: "Carter",
  current_role: "Backend Engineer",
  current_company: "",
  availability: "open_to_work",
  bio: "Backend engineer who likes boring, reliable systems.",
  tech_stack: ["Python", "FastAPI"],
};

let totalPages = 1;

function page(items: AdminUserRow[], params?: AdminUsersParams) {
  return {
    items,
    total: items.length,
    page: params?.page ?? 1,
    per_page: 15,
    total_pages: items.length ? totalPages : 0,
  };
}

beforeEach(() => {
  totalPages = 1;
  mocks.list
    .mockReset()
    .mockImplementation((params?: AdminUsersParams) =>
      Promise.resolve(
        page(params?.search === "zzz" ? [] : [SAMC, PRIYA], params),
      ),
    );
  mocks.detail.mockReset().mockResolvedValue(SAM_DETAIL);
  mocks.update.mockReset().mockResolvedValue({ ...SAMC, is_admin: true });
});

const renderUsers = () =>
  renderPhoneScreen("/admin/users", <UsersPage />, { user: ADMIN });

const row = (id: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="admin-user-row"][data-user-id="${id}"]`,
  )!;

const lastParams = () =>
  mocks.list.mock.calls.at(-1)?.[0] as AdminUsersParams | undefined;

describe("the admin Users board below md (v3/AdminUsers)", () => {
  it("says it is loading while the first page comes", async () => {
    mocks.list.mockReset().mockReturnValue(new Promise(() => {}));
    await renderUsers();

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="phone-skeleton"]'),
      ).toHaveTextContent("Loading users"),
    );
    expect(
      document.querySelector('[data-slot="user-count"]'),
    ).toBeEmptyDOMElement();
  });

  it("shows the server's words and Retry when the list fails", async () => {
    mocks.list.mockReset().mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 503, data: { detail: "Service unavailable now" } },
    });
    const user = userEvent.setup();
    await renderUsers();

    expect(await screen.findByText("Service unavailable now")).toBeVisible();
    mocks.list.mockResolvedValue(page([SAMC]));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("samcarter")).toBeInTheDocument();
  });

  it("says there are no users yet when the list is empty", async () => {
    mocks.list.mockReset().mockResolvedValue(page([]));
    await renderUsers();

    const empty = await screen.findByText("No users yet.");
    expect(empty).toHaveAttribute("data-slot", "users-empty");
    expect(empty).toHaveAttribute("data-reason", "empty");
    expect(empty).toHaveClass("ph-card", "ph-hint");
  });

  it("draws the board: search, count, Sort by and one row per user", async () => {
    await renderUsers();
    await screen.findByText("samcarter");

    const board = document.querySelector('[data-slot="phone-admin-users"]')!;
    expect(board).toHaveClass("ph-app", "ph-ad-body", "ph-ad-list");

    const search = screen.getByRole("searchbox", { name: "Search users" });
    expect(search).toHaveAttribute("placeholder", "Search users...");
    expect(search).toHaveClass("ph-input", "ph-au-search-input");
    expect(
      document.querySelector('[data-slot="user-count"]'),
    ).toHaveTextContent("2 users");
    expect(screen.getByText("Sort by")).toHaveClass("ph-au-sort-by");

    const sam = row("u-sam");
    expect(sam).toHaveClass("ph-au-row");
    expect(sam.querySelector(".ph-au-ini")).toHaveTextContent("SA");
    expect(sam.querySelector(".ph-au-ini")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(within(sam).getByText("samcarter")).toHaveClass("ph-au-name");
    expect(within(sam).getByText("sam@carter.dev")).toHaveClass("ph-au-email");
    expect(within(sam).getByText("3d ago").tagName).toBe("TIME");
    expect(within(sam).getByText("Senior")).toHaveClass("ph-tag");
    expect(within(sam).getByText("Apps 34 · Offers 2 · Denials 9")).toHaveClass(
      "ph-mono",
      "ph-au-counts",
    );
    expect(within(sam).queryByText("admin")).not.toBeInTheDocument();
    expect(
      within(sam).getByRole("button", { name: "Toggle user admin" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(sam).getByRole("button", { name: "View user details" }),
    ).toHaveAttribute("aria-haspopup", "dialog");

    const priya = row("u-priya");
    expect(priya).toHaveAttribute("data-admin", "true");
    expect(within(priya).getByText("admin").closest(".ph-pill")).toHaveClass(
      "ph-pri",
    );
    expect(within(priya).getByText("4mo ago")).toBeInTheDocument();
    // No seniority recorded: no tag.
    expect(priya.querySelector(".ph-tag")).toBeNull();
    expect(
      within(priya).getByRole("button", { name: "Toggle user admin" }),
    ).toHaveAttribute("aria-pressed", "true");
    // One page: no pages control.
    expect(document.querySelector('[data-slot="phone-pager"]')).toBeNull();
  });

  it("names the five sort chips, presses the current one and flips it", async () => {
    const user = userEvent.setup();
    await renderUsers();
    await screen.findByText("samcarter");

    const group = screen.getByRole("group", { name: "Sort users by" });
    const chips = within(group).getAllByRole("button");
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Sort by Joined, descending",
      "Sort by User",
      "Sort by Apps",
      "Sort by Offers",
      "Sort by Denials",
    ]);
    expect(chips.map((chip) => chip.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(chips[0]).toHaveTextContent("Joined↓");
    expect(chips[0]).toHaveClass("ph-chip", "ph-on");

    await user.click(
      within(group).getByRole("button", { name: "Sort by Apps" }),
    );
    const apps = within(group).getByRole("button", {
      name: "Sort by Apps, descending",
    });
    expect(apps).toHaveAttribute("aria-pressed", "true");
    expect(apps.querySelector(".ph-au-arrow")).toHaveTextContent("↓");
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        sort_by: "total_applications",
        sort_order: "desc",
        page: 1,
        per_page: 15,
      }),
    );

    // The current one again reverses its order.
    await user.click(apps);
    expect(apps).toHaveAccessibleName("Sort by Apps, ascending");
    expect(apps.querySelector(".ph-au-arrow")).toHaveTextContent("↑");
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        sort_by: "total_applications",
        sort_order: "asc",
      }),
    );
  });

  it("pages with Previous and Next, and a new sort goes back to the first page", async () => {
    totalPages = 3;
    const user = userEvent.setup();
    await renderUsers();
    await screen.findByText("samcarter");

    const pager = document.querySelector<HTMLElement>(
      '[data-slot="phone-pager"]',
    )!;
    expect(pager.tagName).toBe("DIV");
    expect(within(pager).getByText("Page 1 of 3")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    const previous = within(pager).getByRole("button", {
      name: "Previous page",
    });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    await user.click(previous);
    expect(lastParams()).toMatchObject({ page: 1 });

    await user.click(within(pager).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sort by Denials" }));
    await waitFor(() =>
      expect(lastParams()).toMatchObject({
        sort_by: "denials",
        sort_order: "desc",
        page: 1,
      }),
    );
  });

  it("toggles the administrator flag once, pressed while it saves", async () => {
    let finish: (value: AdminUserRow) => void = () => {};
    mocks.update
      .mockReset()
      .mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    await renderUsers();
    await screen.findByText("samcarter");

    const shield = within(row("u-sam")).getByRole("button", {
      name: "Toggle user admin",
    });
    expect(shield).toHaveClass("ph-iconbtn", "ph-au-shield");
    await user.click(shield);
    expect(mocks.update).toHaveBeenCalledWith("u-sam", { is_admin: true });
    await waitFor(() => expect(shield).toHaveAttribute("aria-busy", "true"));
    expect(shield).toHaveAttribute("aria-disabled", "true");
    expect(shield).toHaveAttribute("data-disabled", "true");

    // A second tap while it saves sends nothing.
    await user.click(shield);
    expect(mocks.update).toHaveBeenCalledTimes(1);

    finish({ ...SAMC, is_admin: true });
    await waitFor(() => expect(shield).not.toHaveAttribute("aria-busy"));
  });

  it("opens a user's details in a sheet, omits the empty rows and returns focus on close", async () => {
    const user = userEvent.setup();
    await renderUsers();
    await screen.findByText("samcarter");

    const open = within(row("u-sam")).getByRole("button", {
      name: "View user details",
    });
    await user.click(open);
    const sheet = await screen.findByRole("dialog", { name: "samcarter" });
    expect(mocks.detail).toHaveBeenCalledWith("u-sam");
    // Focus lands on the sheet's Close.
    const close = within(sheet).getByRole("button", { name: "Close" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(close).toHaveClass("ph-iconbtn", "ph-flat");

    const dl = await waitFor(() => {
      const found = sheet.querySelector<HTMLElement>(
        '[data-slot="user-detail-facts"]',
      );
      expect(found).not.toBeNull();
      return found!;
    });
    expect(dl).toHaveClass("ph-dl", "ph-dl-bg", "ph-au-dl");
    const terms = Array.from(dl.querySelectorAll("dt")).map(
      (dt) => dt.textContent,
    );
    expect(terms).toEqual([
      "Email",
      "GitHub ID",
      "Name",
      "Role",
      "Seniority",
      "Availability",
    ]);
    const value = (term: string) =>
      Array.from(dl.querySelectorAll("dt"))
        .find((dt) => dt.textContent === term)!
        .parentElement!.querySelector("dd")!;
    expect(value("Email")).toHaveTextContent("sam@carter.dev");
    expect(value("Email").parentElement).toHaveClass("ph-au-span");
    expect(value("GitHub ID")).toHaveTextContent("—");
    expect(value("GitHub ID")).toHaveClass("ph-mono");
    expect(value("Name")).toHaveTextContent("Sam Carter");
    expect(value("Role")).toHaveTextContent("Backend Engineer");
    expect(value("Seniority").querySelector(".ph-tag")).toHaveTextContent(
      "Senior",
    );
    expect(value("Availability")).toHaveTextContent("Open to work");

    const stats = within(sheet).getByRole("heading", {
      level: 3,
      name: "Application Stats",
    });
    expect(stats).toHaveClass("ph-gh");
    const statList = sheet.querySelector('[data-slot="user-detail-stats"]')!;
    expect(statList).toHaveClass("ph-dl", "ph-dl-bg", "ph-dl-4");
    expect(
      Array.from(statList.querySelectorAll("div")).map((box) => [
        box.querySelector("dt")!.textContent,
        box.querySelector("dd")!.textContent,
      ]),
    ).toEqual([
      ["Total", "34"],
      ["Offers", "2"],
      ["Denials", "9"],
      ["Active", "12"],
    ]);
    expect(
      within(sheet).getByRole("heading", { level: 3, name: "Bio" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        "Backend engineer who likes boring, reliable systems.",
      ),
    ).toHaveClass("ph-au-bio");
    expect(
      within(sheet).getByRole("heading", { level: 3, name: "Tech Stack" }),
    ).toBeInTheDocument();
    expect(
      Array.from(sheet.querySelectorAll(".ph-au-stack .ph-tag")).map(
        (tag) => tag.textContent,
      ),
    ).toEqual(["Python", "FastAPI"]);

    await user.click(close);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(open).toHaveFocus();
  });

  it("omits Bio and Tech Stack when they are blank, and keeps Email and a GitHub ID", async () => {
    mocks.detail.mockReset().mockResolvedValue({
      ...PRIYA,
      first_name: "",
      last_name: "",
      bio: "   ",
      tech_stack: [],
    } satisfies AdminUserDetail);
    const user = userEvent.setup();
    await renderUsers();
    await screen.findByText("priya.n");

    await user.click(
      within(row("u-priya")).getByRole("button", { name: "View user details" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "priya.n" });
    await within(sheet).findByText("priya@applika.example");
    const terms = Array.from(
      sheet.querySelectorAll('[data-slot="user-detail-facts"] dt'),
    ).map((dt) => dt.textContent);
    expect(terms).toEqual(["Email", "GitHub ID"]);
    expect(within(sheet).getByText("4242")).toBeInTheDocument();
    expect(
      within(sheet).queryByRole("heading", { name: "Bio" }),
    ).not.toBeInTheDocument();
    expect(
      within(sheet).queryByRole("heading", { name: "Tech Stack" }),
    ).not.toBeInTheDocument();
  });

  it("says no user matches in its own words, and a cleared search shows the list at once", async () => {
    const user = userEvent.setup();
    await renderUsers();
    await screen.findByText("samcarter");

    const search = screen.getByRole("searchbox", { name: "Search users" });
    await user.type(search, "zzz");
    const none = await screen.findByText("No users match your search.");
    expect(none).toHaveAttribute("data-reason", "no-match");
    await waitFor(() =>
      expect(lastParams()).toMatchObject({ search: "zzz", page: 1 }),
    );

    await user.clear(search);
    // The full list is cached: it is back on the same render, no loading.
    expect(screen.getByText("samcarter")).toBeInTheDocument();
    expect(
      screen.queryByText("No users match your search."),
    ).not.toBeInTheDocument();
  });

  it("ends a long username and email in an ellipsis instead of breaking the row", async () => {
    const long = "a-very-long-username-that-would-never-fit-on-a-phone-row";
    mocks.list.mockReset().mockResolvedValue(
      page([
        {
          ...SAMC,
          username: long,
          email: `${long}@an-equally-long-domain.example`,
        },
      ]),
    );
    await renderUsers();

    expect(await screen.findByText(long)).toHaveClass("ph-au-name");
    expect(
      screen.getByText(`${long}@an-equally-long-domain.example`),
    ).toHaveClass("ph-au-email");
    expect(row("u-sam").querySelector(".ph-au-who")).not.toBeNull();
  });
});
