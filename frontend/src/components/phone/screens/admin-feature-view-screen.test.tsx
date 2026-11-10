import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeatureViewPage } from "@/app/(protected)/admin/features/view/feature-view-page";
import AdminLayout from "@/app/(protected)/admin/layout";
import { formatFeatureDate } from "@/components/admin/feature-copy";
import type { AdminUserRow, PaginatedResponse } from "@/services/types/admin";
import type {
  AdminFeature,
  AdminFeatureUser,
  AdminFeatureUsersPage,
  AdminFeatureUsersParams,
} from "@/services/types/features";
import type { User } from "@/services/types/users";
import { pathname, setLocation } from "@/test/navigation";
import {
  SAM,
  renderShellAcrossMd,
  renderPhoneScreen,
} from "@/test/phone-screens";

const mocks = vi.hoisted(() => ({
  features: vi.fn(),
  users: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  stage: vi.fn(),
  optOut: vi.fn(),
  optIn: vi.fn(),
  search: vi.fn(),
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
      getFeatures: mocks.features,
      getFeatureUsers: mocks.users,
      addFeatureUser: mocks.add,
      removeFeatureUser: mocks.remove,
      setFeatureStage: mocks.stage,
      optOutFeature: mocks.optOut,
      optInFeature: mocks.optIn,
      getUsers: mocks.search,
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };
const NOON = "2026-10-14T12:00:00Z";

const JOBS: AdminFeature = {
  key: "jobs",
  name: "Job board",
  description: "Remote job list, CV fit and keyword tailoring (PRD 0012)",
  stage: "beta",
  beta_user_count: 2,
  released_at: null,
  updated_at: NOON,
  me: { has: true, via: "admin", opted_out: false },
};

const ALICE: AdminFeatureUser = {
  user_id: "101",
  username: "alice",
  email: "alice@example.com",
  added_at: NOON,
  added_by: { id: "1", username: "priya.n" },
};

const BOB: AdminFeatureUser = {
  user_id: "102",
  username: "bob",
  email: "bob@example.com",
  added_at: "2026-10-13T12:00:00Z",
  added_by: null,
};

function usersPage(
  items: AdminFeatureUser[],
  extra: Partial<AdminFeatureUsersPage> = {},
): AdminFeatureUsersPage {
  return {
    items,
    total: items.length,
    page: 1,
    per_page: 25,
    total_pages: items.length ? 1 : 0,
    ...extra,
  };
}

function candidate(id: string, username: string, isAdmin = false) {
  return {
    id,
    username,
    email: `${username}@example.com`,
    is_admin: isAdmin,
  } as AdminUserRow;
}

function candidates(rows: AdminUserRow[], total = rows.length) {
  return {
    items: rows,
    total,
    page: 1,
    per_page: 10,
    total_pages: 1,
  } as PaginatedResponse<AdminUserRow>;
}

function axiosError(status: number, detail?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data: detail === undefined ? {} : { detail } },
  });
}

/** The beta list answers by search: the list's own and the Add user sheet's. */
function serveList(items: AdminFeatureUser[]) {
  mocks.users.mockImplementation(
    async (_key: string, params?: AdminFeatureUsersParams) => {
      const term = params?.search?.toLowerCase();
      return usersPage(
        term ? items.filter((u) => u.username.includes(term)) : items,
      );
    },
  );
}

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
  pathname.current = "/admin/features/view";
  setLocation("/admin/features/view?key=jobs");
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.features.mockResolvedValue([JOBS]);
  serveList([ALICE, BOB]);
  mocks.search.mockResolvedValue(candidates([]));
});

const renderFeature = () =>
  renderPhoneScreen(
    "/admin/features/view",
    <AdminLayout>
      <FeatureViewPage />
    </AdminLayout>,
    { user: ADMIN },
  );

const ownSwitch = () =>
  screen.getByRole("switch", { name: "Use this feature myself" });
const slot = (name: string, root: ParentNode = document) =>
  root.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;
const member = (username: string) =>
  document.querySelector<HTMLElement>(
    `li[data-slot="feature-beta-user"][data-username="${username}"]`,
  );

describe("a feature's page below md", () => {
  it("draws the board: back Features, the System pill, the feature, its stage action, Your access and the Beta list", async () => {
    await renderFeature();

    const h1 = await screen.findByRole("heading", {
      level: 1,
      name: "Job board",
    });
    expect(h1).toHaveClass("ph-h1", "ph-h1-26", "ph-fv-name");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    // The bar: back to Features and the System pill, no chips, no Admin Console.
    // The shell's bar (jsdom also counts the feature's own <header> a banner).
    const bar = screen
      .getAllByRole("banner")
      .find((el) => el.dataset.slot !== "feature-header")!;
    const back = within(bar).getByRole("link");
    expect(back).toHaveAccessibleName("Features");
    expect(back).toHaveAttribute("href", "/admin/features");
    expect(within(bar).getByText("System")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Admin sections" }),
    ).toBeNull();
    expect(screen.queryByText("Admin Console")).toBeNull();

    const header = slot("feature-header");
    expect(header).toHaveAttribute("data-state", "ready");
    expect(within(header).getByText("Beta").closest(".ph-pill")).toHaveClass(
      "ph-pri",
    );
    expect(slot("feature-description", header)).toHaveTextContent(
      "Remote job list, CV fit and keyword tailoring (PRD 0012)",
    );
    expect(slot("feature-description", header)).toHaveClass("ph-lead");
    const facts = header.querySelector("dl")!;
    expect(facts).toHaveClass("ph-dl");
    expect(
      Array.from(facts.querySelectorAll("dt"), (term) => term.textContent),
    ).toEqual(["Key", "Released"]);
    expect(slot("feature-key", header)).toHaveTextContent("jobs");
    expect(slot("feature-released", header)).toHaveTextContent("Not released");
    const stage = within(header).getByRole("button", {
      name: "Release to everyone",
    });
    expect(stage).toHaveClass("ph-btn", "ph-pri");
    expect(stage).toHaveAttribute("aria-haspopup", "dialog");
    expect(stage).toHaveAttribute("data-next-stage", "general");

    const access = screen.getByRole("region", { name: "Your access" });
    expect(access).toHaveClass("ph-card", "ph-fv-card");
    expect(slot("feature-own-access-reason", access)).toHaveTextContent(
      "You have this feature because you're an admin.",
    );
    expect(ownSwitch()).toHaveAttribute("aria-checked", "true");
    expect(ownSwitch()).not.toHaveAttribute("aria-disabled");
    expect(ownSwitch()).toHaveAccessibleDescription(
      "Turn it off to see the app as users without it do. This changes only what you see.",
    );

    const list = screen.getByRole("region", { name: "Beta list" });
    expect(await within(list).findByText("alice")).toHaveClass("ph-fv-user");
    expect(slot("feature-beta-list-count", list)).toHaveTextContent("2 users");
    expect(
      within(list).getByText(
        "These users have it while it's in beta. Admins have it without being on the list.",
      ),
    ).toHaveClass("ph-hint");
    const search = within(list).getByRole("searchbox", {
      name: "Search the beta list",
    });
    expect(search).toHaveAttribute("placeholder", "Search by username");
    expect(search).toHaveAttribute("maxlength", "100");
    expect(
      within(list).getByRole("button", { name: "Add user" }),
    ).toHaveAttribute("aria-haspopup", "dialog");
    const alice = member("alice")!;
    expect(within(alice).getByText("alice@example.com")).toHaveClass(
      "ph-fv-email",
    );
    expect(slot("feature-beta-user-added-line", alice)).toHaveTextContent(
      `Added ${formatFeatureDate(NOON)} by priya.n`,
    );
    expect(
      slot("feature-beta-user-added-line", member("bob")!),
    ).toHaveTextContent(`Added ${formatFeatureDate("2026-10-13T12:00:00Z")}`);
    const remove = within(alice).getByRole("button", { name: "Remove alice" });
    expect(remove).toHaveTextContent("Remove");
    expect(remove).toHaveClass("ph-btn", "ph-dan", "ph-sm");
    // One page: no pager.
    expect(
      screen.queryByRole("navigation", { name: "Beta list pages" }),
    ).toBeNull();
  });

  it("turns the switch off with PUT opt-out, busy and still focused while it saves", async () => {
    let settle: () => void = () => {};
    mocks.optOut.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");

    await user.click(ownSwitch());
    expect(mocks.optOut).toHaveBeenCalledWith("jobs");
    await waitFor(() =>
      expect(ownSwitch()).toHaveAttribute("aria-busy", "true"),
    );
    expect(ownSwitch()).toHaveAttribute("aria-checked", "false");
    expect(ownSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(ownSwitch()).toHaveFocus();
    await user.click(ownSwitch());
    expect(mocks.optOut).toHaveBeenCalledTimes(1);
    expect(mocks.optIn).not.toHaveBeenCalled();

    mocks.features.mockResolvedValue([
      { ...JOBS, me: { has: false, via: null, opted_out: true } },
    ]);
    settle();
    await waitFor(() => expect(ownSwitch()).not.toHaveAttribute("aria-busy"));
    expect(ownSwitch()).toHaveAttribute("aria-checked", "false");
    expect(slot("feature-own-access-reason")).toHaveTextContent(
      "You don't have this feature because you turned it off.",
    );
  });

  it("locks Your access on a released feature: focusable, the stored choice, today's words", async () => {
    mocks.features.mockResolvedValue([
      {
        ...JOBS,
        stage: "general",
        released_at: "2026-11-08T12:00:00Z",
        me: { has: true, via: "general", opted_out: true },
      },
    ]);
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");

    const header = slot("feature-header");
    expect(within(header).getByText("General").closest(".ph-pill")).toHaveClass(
      "ph-ok",
    );
    expect(
      within(header).getByRole("button", { name: "Move back to beta" }),
    ).toHaveClass("ph-btn", "ph-sec");
    expect(slot("feature-released", header)).toHaveTextContent(
      formatFeatureDate("2026-11-08T12:00:00Z"),
    );

    const locked = ownSwitch();
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).not.toBeDisabled();
    expect(locked).not.toHaveAttribute("aria-busy");
    expect(locked).toHaveAttribute("data-lock", "general");
    // The stored choice (an opt-out), as today's desktop switch shows it.
    expect(locked).toHaveAttribute("aria-checked", "false");
    expect(locked).toHaveAccessibleDescription(
      "Released to everyone. Your choice applies again if it moves back to beta.",
    );
    expect(slot("feature-own-access-reason")).toHaveTextContent(
      "You have this feature because it's released to everyone.",
    );
    locked.focus();
    expect(locked).toHaveFocus();
    await user.click(locked);
    await user.keyboard(" ");
    expect(mocks.optIn).not.toHaveBeenCalled();
    expect(mocks.optOut).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "Everyone has it now. The list is kept and counts again if it moves back to beta.",
      ),
    ).toBeInTheDocument();
  });

  it("locks Your access for an administrator on the beta list, with today's reason", async () => {
    mocks.features.mockResolvedValue([
      { ...JOBS, me: { has: true, via: "list", opted_out: false } },
    ]);
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");

    const locked = ownSwitch();
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).toHaveAttribute("data-lock", "list");
    expect(locked).toHaveAttribute("aria-checked", "true");
    expect(locked).toHaveAccessibleDescription(
      "You're on the beta list, so you keep access. Remove yourself from the list to hide it.",
    );
    expect(slot("feature-own-access-reason")).toHaveTextContent(
      "You have this feature because you're on the beta list.",
    );
    await user.click(locked);
    expect(mocks.optOut).not.toHaveBeenCalled();
  });

  it("confirms Release to everyone in a sheet: Cancel first and back on the button, the server's words in place", async () => {
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");
    const stage = screen.getByRole("button", { name: "Release to everyone" });

    await user.click(stage);
    let sheet = await screen.findByRole("alertdialog", {
      name: "Release Job board to everyone?",
    });
    expect(sheet).toHaveAccessibleDescription(
      "Every user gets Job board, including admins who turned it off. The beta list is kept, so you can move it back to beta later.",
    );
    expect(slot("feature-stage-sheet", sheet)).toHaveAttribute(
      "data-next-stage",
      "general",
    );
    const [cancel, confirm] = within(sheet).getAllByRole("button");
    expect(cancel).toHaveTextContent("Cancel");
    expect(cancel).toHaveFocus();
    expect(confirm).toHaveTextContent("Release to everyone");
    expect(confirm).toHaveClass("ph-btn", "ph-pri");
    await user.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(stage).toHaveFocus();
    expect(mocks.stage).not.toHaveBeenCalled();

    mocks.stage.mockRejectedValueOnce(
      axiosError(409, "Job board is already released"),
    );
    await user.click(stage);
    sheet = await screen.findByRole("alertdialog");
    await user.click(
      within(sheet).getByRole("button", { name: "Release to everyone" }),
    );
    expect(mocks.stage).toHaveBeenCalledWith("jobs", "general");
    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "feature-stage-error");
    expect(refusal).toHaveTextContent("Job board is already released");
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    mocks.stage.mockResolvedValueOnce({ ...JOBS, stage: "general" });
    mocks.features.mockResolvedValue([
      {
        ...JOBS,
        stage: "general",
        released_at: NOON,
        me: { has: true, via: "general", opted_out: false },
      },
    ]);
    await user.click(
      within(sheet).getByRole("button", { name: "Release to everyone" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(
      await screen.findByRole("button", { name: "Move back to beta" }),
    ).toHaveFocus();
  });

  it("confirms Move back to beta in a sheet with its two lines", async () => {
    mocks.features.mockResolvedValue([
      {
        ...JOBS,
        stage: "general",
        released_at: NOON,
        me: { has: true, via: "general", opted_out: false },
      },
    ]);
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: "Move back to beta" }));
    const sheet = await screen.findByRole("alertdialog", {
      name: "Move Job board back to beta?",
    });
    expect(
      within(sheet).getByText(
        "Users who are neither on this list nor admins lose access.",
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText(
        "The beta list stays as it is, and admins who turned it off lose it again.",
      ),
    ).toHaveClass("ph-fv-muted");
    expect(
      within(sheet).getByRole("button", { name: "Move back to beta" }),
    ).toHaveClass("ph-pri");
  });

  it("removes a member after its sheet: a refusal stays inside, success hands focus to the search", async () => {
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: "Remove alice" }));
    let sheet = await screen.findByRole("alertdialog", {
      name: "Remove alice from the beta list?",
    });
    expect(sheet).toHaveAccessibleDescription(
      "alice loses Job board on their next page load, unless they're an admin. You can add them again later.",
    );
    expect(within(sheet).getAllByRole("button")[0]).toHaveFocus();
    await user.click(within(sheet).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Remove alice" })).toHaveFocus();
    expect(mocks.remove).not.toHaveBeenCalled();

    mocks.remove.mockRejectedValueOnce(axiosError(404, "User not on the list"));
    await user.click(screen.getByRole("button", { name: "Remove alice" }));
    sheet = await screen.findByRole("alertdialog");
    await user.click(within(sheet).getByRole("button", { name: "Remove" }));
    expect(mocks.remove).toHaveBeenCalledWith("jobs", "101");
    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "feature-beta-user-error");
    expect(refusal).toHaveTextContent("User not on the list");
    expect(toast.error).not.toHaveBeenCalled();

    mocks.remove.mockResolvedValueOnce(undefined);
    serveList([BOB]);
    await user.click(within(sheet).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect(member("alice")).toBeNull());
    await waitFor(() =>
      expect(
        screen.getByRole("searchbox", { name: "Search the beta list" }),
      ).toHaveFocus(),
    );
  });

  it("adds users from a sheet: search everyone, the Admin mark, Add then On the list, Done", async () => {
    mocks.search.mockImplementation(async ({ search }: { search: string }) =>
      search === "zz"
        ? candidates([])
        : candidates(
            [
              candidate("201", "dkim"),
              candidate("101", "alice"),
              candidate("1", "priya.n", true),
            ],
            12,
          ),
    );
    mocks.add.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");
    const trigger = screen.getByRole("button", { name: "Add user" });

    await user.click(trigger);
    const sheet = await screen.findByRole("dialog", {
      name: "Add users to the beta list",
    });
    expect(sheet).toHaveAccessibleDescription(
      "Search all users by username or email. A user you add gets Job board on their next page load.",
    );
    const search = within(sheet).getByRole("searchbox", {
      name: "Search users",
    });
    expect(search).toHaveAttribute("placeholder", "Username or email");
    expect(search).toHaveFocus();
    expect(
      within(sheet).getByText("Type a username or email to find a user."),
    ).toBeInTheDocument();

    await user.type(search, "d");
    const dkim = await within(sheet).findByRole("button", { name: "Add dkim" });
    expect(dkim).toHaveClass("ph-btn", "ph-pri", "ph-sm");
    // Listed already (the beta list searched with the same text, plus the page).
    const alice = within(sheet).getByRole("button", {
      name: "alice is on the list",
    });
    expect(alice).toHaveAttribute("aria-disabled", "true");
    expect(within(alice).getByText("On the list")).toHaveClass(
      "ph-pill",
      "ph-ok",
    );
    const priya = sheet.querySelector<HTMLElement>(
      'li[data-slot="feature-add-user-row"][data-username="priya.n"]',
    )!;
    expect(within(priya).getByText("Admin")).toBeInTheDocument();
    expect(
      within(sheet).getByText("Showing 3 of 12. Type more to narrow it down."),
    ).toBeInTheDocument();

    await user.click(dkim);
    expect(mocks.add).toHaveBeenCalledWith("jobs", "201");
    const listed = await within(sheet).findByRole("button", {
      name: "dkim is on the list",
    });
    expect(listed).toBe(dkim);
    expect(listed).toHaveFocus();
    expect(slot("feature-add-user-status", sheet)).toHaveTextContent(
      "dkim is on the beta list now.",
    );

    await user.clear(search);
    await user.type(search, "zz");
    expect(
      await within(sheet).findByText('No user matches "zz".'),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger).toHaveFocus();
    // Closing clears the search, as today's dialog.
    await user.click(trigger);
    expect(
      within(
        await screen.findByRole("dialog", {
          name: "Add users to the beta list",
        }),
      ).getByRole("searchbox", { name: "Search users" }),
    ).toHaveValue("");
  });

  it("shows an add the server refused inside the sheet", async () => {
    mocks.search.mockResolvedValue(candidates([candidate("201", "dkim")]));
    mocks.add.mockRejectedValueOnce(axiosError(409, "dkim is already listed"));
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: "Add user" }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByRole("searchbox"), "dk");
    await user.click(
      await within(sheet).findByRole("button", { name: "Add dkim" }),
    );
    const refusal = await within(sheet).findByRole("alert");
    expect(refusal).toHaveAttribute("data-slot", "feature-add-user-error");
    expect(refusal).toHaveTextContent("dkim is already listed");
    expect(toast.error).not.toHaveBeenCalled();
    expect(
      within(sheet).getByRole("button", { name: "Add dkim" }),
    ).toBeInTheDocument();
  });

  it("says no member matches in its own words, and Clear search shows the list at once", async () => {
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");
    const search = screen.getByRole("searchbox", {
      name: "Search the beta list",
    });

    await user.type(search, "zed");
    expect(
      await screen.findByText('No one on the list matches "zed"'),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The search looks at usernames only."),
    ).toBeInTheDocument();
    expect(slot("feature-beta-list").getAttribute("data-state")).toBe(
      "no-match",
    );

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    // The cleared search reads the cached full list: no wait, no empty flash.
    expect(member("alice")).not.toBeNull();
    expect(member("bob")).not.toBeNull();
  });

  it("says no one is on the list yet", async () => {
    serveList([]);
    await renderFeature();

    expect(
      await screen.findByText("No one is on the beta list"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Users you add get this feature while it's in beta."),
    ).toBeInTheDocument();
  });

  it("pages 25 at a time under the list, named as today", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...ALICE,
      user_id: `u${i}`,
      username: `member${i}`,
    }));
    mocks.users.mockImplementation(
      async (_key: string, params?: AdminFeatureUsersParams) =>
        params?.page === 2
          ? usersPage([{ ...BOB, user_id: "u25", username: "member25" }], {
              total: 26,
              page: 2,
              total_pages: 2,
            })
          : usersPage(many, { total: 26, page: 1, total_pages: 2 }),
    );
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("member0");

    expect(mocks.users).toHaveBeenCalledWith("jobs", {
      search: undefined,
      page: 1,
      per_page: 25,
    });
    expect(
      document.querySelectorAll('li[data-slot="feature-beta-user"]'),
    ).toHaveLength(25);
    expect(slot("feature-beta-list-count")).toHaveTextContent("26 users");
    const pager = screen.getByRole("navigation", { name: "Beta list pages" });
    expect(pager).toHaveClass("ph-pager", "ph-fv-pager");
    expect(slot("feature-beta-users")).toHaveAttribute("data-paged");
    expect(
      within(pager).getByRole("button", { name: "Previous page" }),
    ).toHaveAttribute("aria-disabled", "true");

    await user.click(within(pager).getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("member25")).toBeInTheDocument();
    expect(mocks.users).toHaveBeenCalledWith("jobs", {
      search: undefined,
      page: 2,
      per_page: 25,
    });
  });

  it("offers Go to page N, the last page there is, when the page on screen emptied under the admin", async () => {
    mocks.users.mockImplementation(
      async (_key: string, params?: AdminFeatureUsersParams) => {
        const page = params?.page ?? 1;
        if (page === 3) {
          return usersPage([], { total: 50, page: 3, total_pages: 2 });
        }
        return usersPage([page === 2 ? BOB : ALICE], {
          total: 51,
          page,
          total_pages: 3,
        });
      },
    );
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("bob");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("This page is empty")).toBeInTheDocument();
    expect(slot("feature-beta-list-count")).toHaveTextContent("50 users");
    expect(
      screen.queryByRole("navigation", { name: "Beta list pages" }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Go to page 2" }));
    expect(await screen.findByText("bob")).toBeInTheDocument();
    expect(mocks.users).toHaveBeenLastCalledWith("jobs", {
      search: undefined,
      page: 2,
      per_page: 25,
    });
  });

  it("goes back to the first page when the beta search changes", async () => {
    mocks.users.mockImplementation(
      async (_key: string, params?: AdminFeatureUsersParams) =>
        params?.search
          ? usersPage([BOB], { total: 1, page: 1, total_pages: 1 })
          : usersPage([params?.page === 2 ? BOB : ALICE], {
              total: 26,
              page: params?.page ?? 1,
              total_pages: 2,
            }),
    );
    const user = userEvent.setup();
    await renderFeature();
    await screen.findByText("alice");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("bob");

    await user.type(
      screen.getByRole("searchbox", { name: "Search the beta list" }),
      "bo",
    );
    await waitFor(() =>
      expect(mocks.users).toHaveBeenCalledWith("jobs", {
        search: "bo",
        page: 1,
        per_page: 25,
      }),
    );
    expect(mocks.users).not.toHaveBeenCalledWith("jobs", {
      search: "bo",
      page: 2,
      per_page: 25,
    });
  });

  it("shows the beta list's failure with the server's words and Try again", async () => {
    mocks.users.mockRejectedValue(axiosError(500, "The list is down"));
    await renderFeature();

    const list = slot("feature-beta-list");
    await waitFor(() => expect(list).toHaveAttribute("data-state", "error"));
    expect(within(list).getByRole("alert")).toHaveTextContent(
      "Could not load the beta list",
    );
    expect(slot("feature-beta-list-error", list)).toHaveTextContent(
      "The list is down",
    );
    expect(
      within(list).getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("shows only the header's failure when the features list does not load", async () => {
    mocks.features.mockRejectedValue(axiosError(500));
    await renderFeature();

    const failure = await screen.findByRole("heading", {
      level: 1,
      name: "Could not load this feature",
    });
    expect(failure.closest('[role="alert"]')).toHaveAttribute(
      "data-slot",
      "feature-header-error",
    );
    expect(
      screen.getByText("Check your connection and try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your access" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Beta list" })).toBeNull();
  });

  it.each([
    [
      "no key",
      "/admin/features/view",
      "No feature key was given. Pick one from the list.",
    ],
    [
      "an unknown key",
      "/admin/features/view?key=nope",
      'No feature has the key "nope". Pick one from the list.',
    ],
  ])("says the feature is not found for %s", async (_case, url, body) => {
    setLocation(url);
    await renderFeature();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Feature not found",
      }),
    ).toHaveClass("ph-h1", "ph-h1-26");
    expect(screen.getByText(body)).toHaveClass("ph-lead");
    const backLink = screen.getByRole("link", { name: "Back to features" });
    expect(backLink).toHaveAttribute("href", "/admin/features");
    expect(backLink).toHaveClass("ph-btn", "ph-sec");
    expect(slot("phone-admin-feature")).toHaveAttribute(
      "data-state",
      "not-found",
    );
    expect(screen.queryByRole("region", { name: "Beta list" })).toBeNull();
  });

  it("hands focus back to the feature once the header's Try again loads it", async () => {
    mocks.features
      .mockReset()
      .mockRejectedValueOnce(axiosError(500))
      .mockResolvedValue([JOBS]);
    const user = userEvent.setup();
    await renderFeature();

    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Job board" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(slot("feature-header")).toHaveFocus());
  });

  it("keeps the feature on screen when a later features refetch fails", async () => {
    const { client } = await renderFeature();
    await screen.findByRole("heading", { level: 1, name: "Job board" });
    await screen.findByText("alice");

    mocks.features.mockRejectedValue(axiosError(500));
    await client.refetchQueries({ queryKey: ["admin", "features"] });
    await waitFor(() => expect(mocks.features).toHaveBeenCalledTimes(2));

    expect(
      screen.getByRole("heading", { level: 1, name: "Job board" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Could not load this feature")).toBeNull();
    expect(
      screen.getByRole("region", { name: "Your access" }),
    ).toBeInTheDocument();
    expect(slot("feature-header")).toHaveAttribute("data-state", "ready");
  });

  it("says the server's 404 words as the heading", async () => {
    mocks.users.mockRejectedValue(axiosError(404, "Feature not found: jobs"));
    await renderFeature();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Feature not found: jobs",
      }),
    ).toBeInTheDocument();
  });

  it("ends a long feature name and username in an ellipsis, the email too", async () => {
    const longName =
      "A feature name far too long to sit on one phone row beside its pill";
    const longUser = "a-very-long-username-that-would-never-fit-on-one-row";
    mocks.features.mockResolvedValue([{ ...JOBS, name: longName }]);
    serveList([{ ...ALICE, username: longUser }]);
    await renderFeature();

    expect(
      await screen.findByRole("heading", { level: 1, name: longName }),
    ).toHaveClass("ph-fv-name");
    const row = await waitFor(() => {
      const found = member(longUser);
      expect(found).not.toBeNull();
      return found!;
    });
    expect(within(row).getByText(longUser)).toHaveClass("ph-fv-user");
    expect(within(row).getByText("alice@example.com")).toHaveClass(
      "ph-fv-email",
    );
  });
});

describe("a feature's page across md", () => {
  it("closes a half-searched Add user sheet when the screen turns past md, and loses the search", async () => {
    mocks.search.mockResolvedValue(candidates([candidate("201", "dkim")]));
    const user = userEvent.setup();
    const { viewport } = renderShellAcrossMd(
      "/admin/features/view",
      <FeatureViewPage />,
      { user: ADMIN },
    );
    await screen.findByText("alice");

    await user.click(screen.getByRole("button", { name: "Add user" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Add users to the beta list",
    });
    await user.type(within(sheet).getByRole("searchbox"), "dk");
    await within(sheet).findByRole("button", { name: "Add dkim" });

    viewport.setPhone(false);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      document.querySelector('[data-slot="phone-admin-feature"]'),
    ).toBeNull();
    // Today's desktop page, its table and its own Add user dialog.
    expect(await screen.findByRole("table")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add user" }));
    expect(
      within(await screen.findByRole("dialog")).getByRole("searchbox"),
    ).toHaveValue("");
  });
});
