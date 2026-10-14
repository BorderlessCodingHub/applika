import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeatureViewPage } from "./feature-view-page";
import { formatFeatureDate } from "@/components/admin/feature-copy";
import { services } from "@/services/services";
import type { AdminUserRow, PaginatedResponse } from "@/services/types/admin";
import type {
  AdminFeature,
  AdminFeatureUser,
  AdminFeatureUsersPage,
  AdminFeatureUsersParams,
} from "@/services/types/features";

/**
 * KODI-054 (plan 0013, T048) — `/admin/features/view?key=` (AC2-AC11): the
 * beta list (columns, search, pager, add, duplicate add, remove behind a
 * confirm), the stage dialogs and their words, "Your access" (each reason,
 * the general and listed locks with their words, PUT/DELETE opt-out), Cancel
 * sends nothing, an unknown key, and the 404 `detail` verbatim. Pattern:
 * `jobs-page.test.tsx` (mock `services`, not the hooks).
 */

let searchParams = new URLSearchParams("key=jobs");

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getFeatures: vi.fn(),
      getFeatureUsers: vi.fn(),
      addFeatureUser: vi.fn(),
      removeFeatureUser: vi.fn(),
      setFeatureStage: vi.fn(),
      optOutFeature: vi.fn(),
      optInFeature: vi.fn(),
      getUsers: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const NOON = "2026-10-14T12:00:00Z";

const JOBS: AdminFeature = {
  key: "jobs",
  name: "Jobs",
  description: "Job board with saved searches.",
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
  added_by: { id: "1", username: "root-admin" },
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

function candidate(
  id: string,
  username: string,
  isAdmin = false,
): AdminUserRow {
  return {
    id,
    username,
    email: `${username}@example.com`,
    is_admin: isAdmin,
  } as AdminUserRow;
}

function candidates(rows: AdminUserRow[]): PaginatedResponse<AdminUserRow> {
  return {
    items: rows,
    total: rows.length,
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FeatureViewPage />
    </QueryClientProvider>,
  );
}

const admin = vi.mocked(services.admin);

/** The beta list answers by search: the list's own and the add dialog's. */
function serveList(items: AdminFeatureUser[]) {
  admin.getFeatureUsers.mockImplementation(
    async (_key: string, params?: AdminFeatureUsersParams) => {
      const term = params?.search?.toLowerCase();
      return usersPage(
        term ? items.filter((u) => u.username.includes(term)) : items,
      );
    },
  );
}

function betaRow(username: string) {
  return document.querySelector(
    `tr[data-slot="feature-beta-user"][data-username="${username}"]`,
  ) as HTMLTableRowElement | null;
}

function ownSwitch() {
  return screen.getByRole("switch", { name: "Use this feature myself" });
}

function reason() {
  return document.querySelector(
    '[data-slot="feature-own-access-reason"]',
  ) as HTMLElement;
}

function hint() {
  return document.querySelector(
    '[data-slot="feature-own-access-hint"]',
  ) as HTMLElement;
}

beforeEach(() => {
  searchParams = new URLSearchParams("key=jobs");
  for (const fn of Object.values(admin)) vi.mocked(fn).mockReset();
  admin.getFeatures.mockResolvedValue([JOBS]);
  serveList([ALICE, BOB]);
  admin.addFeatureUser.mockResolvedValue(undefined);
  admin.removeFeatureUser.mockResolvedValue(undefined);
  admin.optOutFeature.mockResolvedValue(undefined);
  admin.optInFeature.mockResolvedValue(undefined);
});

describe("FeatureViewPage — header and states", () => {
  it("shows the loading states while the feature and the list load", () => {
    admin.getFeatures.mockReturnValue(new Promise(() => {}));
    admin.getFeatureUsers.mockReturnValue(new Promise(() => {}));
    renderPage();

    const statuses = screen
      .getAllByRole("status")
      .map((node) => node.textContent);
    expect(statuses).toEqual(
      expect.arrayContaining([
        "Loading feature",
        "Loading your access",
        "Loading the beta list",
      ]),
    );
    expect(
      screen.getByRole("searchbox", { name: "Search the beta list" }),
    ).toBeInTheDocument();
  });

  it("shows the feature's name, stage, description, key and release", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Jobs", level: 1 }),
    ).toBeInTheDocument();
    const header = document.querySelector(
      '[data-slot="feature-header"]',
    ) as HTMLElement;
    expect(header).toHaveTextContent("Job board with saved searches.");
    expect(within(header).getByText("jobs")).toBeInTheDocument();
    expect(within(header).getByText("Beta", { exact: true })).toBeVisible();
    expect(header).toHaveTextContent("Not released");
  });

  it("shows the header error and retries", async () => {
    admin.getFeatures
      .mockRejectedValueOnce(axiosError(500))
      .mockResolvedValueOnce([JOBS]);
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", {
        name: "Could not load this feature",
      }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent("Check your connection and try again.");
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Jobs", level: 1 }),
    ).toBeInTheDocument();
  });

  it("an unknown key shows the not-found message and asks for nothing else", async () => {
    searchParams = new URLSearchParams("key=nope");
    admin.getFeatureUsers.mockRejectedValue(
      axiosError(404, "Feature not found"),
    );
    renderPage();

    const notFound = await waitFor(() => {
      const node = document.querySelector('[data-slot="feature-not-found"]');
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(
      within(notFound).getByRole("heading", { name: "Feature not found" }),
    ).toBeInTheDocument();
    expect(notFound).toHaveTextContent(
      'No feature has the key "nope". Pick one from the list.',
    );
    expect(
      within(notFound).getByRole("link", { name: "Back to features" }),
    ).toHaveAttribute("href", "/admin/features");
    expect(
      screen.queryByRole("switch", { name: "Use this feature myself" }),
    ).not.toBeInTheDocument();
  });

  it("an unknown key shows the API's 404 detail word for word", async () => {
    searchParams = new URLSearchParams("key=gone");
    admin.getFeatures.mockReturnValue(new Promise(() => {}));
    admin.getFeatureUsers.mockRejectedValue(
      axiosError(404, "Feature not found"),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Feature not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No feature has the key "gone". Pick one from the list.',
      ),
    ).toBeInTheDocument();
  });

  it("no key at all asks the admin to pick one", async () => {
    searchParams = new URLSearchParams("");
    renderPage();

    expect(
      await screen.findByText(
        "No feature key was given. Pick one from the list.",
      ),
    ).toBeInTheDocument();
    expect(admin.getFeatureUsers).not.toHaveBeenCalled();
  });
});

describe("FeatureViewPage — beta list (AC2, AC4)", () => {
  it("lists username, added and added by (or a dash), with the count", async () => {
    renderPage();

    await waitFor(() => expect(betaRow("alice")).not.toBeNull());
    const headers = within(
      screen.getByRole("table", { name: /Beta list/ }),
    ).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent?.trim())).toEqual([
      "Username",
      "Added",
      "Added by",
      "Actions",
    ]);
    const alice = betaRow("alice") as HTMLElement;
    expect(
      alice.querySelector('[data-slot="feature-beta-user-added"]'),
    ).toHaveTextContent(formatFeatureDate(NOON));
    expect(
      alice.querySelector('[data-slot="feature-beta-user-added-by"]'),
    ).toHaveTextContent("root-admin");
    const bob = betaRow("bob") as HTMLElement;
    expect(
      bob.querySelector('[data-slot="feature-beta-user-added-by"]'),
    ).toHaveTextContent("—");
    expect(
      document.querySelector('[data-slot="feature-beta-list-count"]'),
    ).toHaveTextContent("2 users");
    expect(admin.getFeatureUsers).toHaveBeenCalledWith("jobs", {
      search: undefined,
      page: 1,
      per_page: 25,
    });
  });

  it("shows the empty list", async () => {
    serveList([]);
    renderPage();

    expect(
      await screen.findByText("No one is on the beta list"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Users you add get this feature while it's in beta."),
    ).toBeInTheDocument();
  });

  it("searches by username, back on page 1, and says when nothing matches", async () => {
    admin.getFeatureUsers.mockImplementation(async (_key, params) => {
      if (params?.page === 2) {
        return usersPage([BOB], { total: 26, page: 2, total_pages: 2 });
      }
      if (params?.search === "zed") return usersPage([]);
      return usersPage([ALICE], { total: 26, total_pages: 2 });
    });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Next page" }),
    );
    await waitFor(() => expect(betaRow("bob")).not.toBeNull());

    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search the beta list" }),
      "zed",
    );
    expect(
      await screen.findByText('No one on the list matches "zed"'),
    ).toBeInTheDocument();
    expect(admin.getFeatureUsers).toHaveBeenLastCalledWith("jobs", {
      search: "zed",
      page: 1,
      per_page: 25,
    });
    expect(
      screen.getByText("The search looks at usernames only."),
    ).toBeInTheDocument();
  });

  it("pages 25 at a time", async () => {
    admin.getFeatureUsers.mockImplementation(async (_key, params) =>
      params?.page === 2
        ? usersPage([BOB], { total: 26, page: 2, total_pages: 2 })
        : usersPage([ALICE], { total: 26, total_pages: 2 }),
    );
    renderPage();

    const pager = await screen.findByRole("navigation", {
      name: "Beta list pages",
    });
    expect(pager).toHaveTextContent("Page 1 of 2");
    expect(
      within(pager).getByRole("button", { name: "Previous page" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      within(pager).getByRole("button", { name: "Next page" }),
    );

    await waitFor(() => expect(betaRow("bob")).not.toBeNull());
    expect(pager).toHaveTextContent("Page 2 of 2");
    expect(admin.getFeatureUsers).toHaveBeenLastCalledWith("jobs", {
      search: undefined,
      page: 2,
      per_page: 25,
    });
  });

  it("shows a page past the end as empty with a way back", async () => {
    // Page 2 emptied under the admin (its last user was removed elsewhere).
    admin.getFeatureUsers.mockImplementation(async (_key, params) =>
      params?.page === 2
        ? usersPage([], { total: 25, page: 2, total_pages: 1 })
        : usersPage([ALICE], { total: 26, total_pages: 2 }),
    );
    renderPage();
    await userEvent.click(
      await screen.findByRole("button", { name: "Next page" }),
    );

    expect(await screen.findByText("This page is empty")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="feature-beta-list-count"]'),
    ).toHaveTextContent("25 users");
    await userEvent.click(screen.getByRole("button", { name: "Go to page 1" }));
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());
    expect(admin.getFeatureUsers).toHaveBeenLastCalledWith("jobs", {
      search: undefined,
      page: 1,
      per_page: 25,
    });
  });

  it("shows the load error with the server's detail and retries", async () => {
    admin.getFeatureUsers
      .mockRejectedValueOnce(axiosError(500))
      .mockResolvedValue(usersPage([ALICE]));
    renderPage();

    const error = await waitFor(() => {
      const node = document.querySelector(
        '[data-slot="feature-beta-list-error"]',
      );
      expect(node).not.toBeNull();
      return node as HTMLElement;
    });
    expect(error).toHaveTextContent(
      "The list did not load. Check your connection and try again.",
    );
    const alert = error.closest('[role="alert"]') as HTMLElement;
    expect(alert).toHaveTextContent("Could not load the beta list");
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());
  });

  it("removes a user only after the confirm, and Cancel sends nothing", async () => {
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Remove alice" }));
    let dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove alice from the beta list?");
    expect(dialog).toHaveTextContent(
      "alice loses Jobs on their next page load, unless they're an admin. You can add them again later.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(admin.removeFeatureUser).not.toHaveBeenCalled();

    serveList([BOB]);
    await userEvent.click(screen.getByRole("button", { name: "Remove alice" }));
    dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove" }),
    );

    await waitFor(() =>
      expect(admin.removeFeatureUser).toHaveBeenCalledWith("jobs", "101"),
    );
    await waitFor(() => expect(betaRow("alice")).toBeNull());
    expect(betaRow("bob")).not.toBeNull();
  });

  it("shows a remove failure's detail word for word", async () => {
    admin.removeFeatureUser.mockRejectedValue(
      axiosError(404, "Feature not found"),
    );
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Remove alice" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove" }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="feature-beta-user-error"]'),
      ).toHaveTextContent("Feature not found"),
    );
  });

  it("removing in general warns the user keeps it while released", async () => {
    admin.getFeatures.mockResolvedValue([
      {
        ...JOBS,
        stage: "general",
        released_at: NOON,
        me: { has: true, via: "general", opted_out: false },
      },
    ]);
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Remove alice" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "alice keeps Jobs while it's released to everyone, and loses it if it moves back to beta.",
    );
  });
});

describe("FeatureViewPage — add user (AC3)", () => {
  it("searches all users and adds one", async () => {
    admin.getUsers.mockResolvedValue(
      candidates([candidate("201", "carol"), candidate("1", "boss", true)]),
    );
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Add users to the beta list",
    });
    expect(dialog).toHaveTextContent(
      "Type a username or email to find a user.",
    );
    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: "Search users" }),
      "ca",
    );

    const add = await within(dialog).findByRole("button", {
      name: "Add carol",
    });
    expect(admin.getUsers).toHaveBeenCalledWith({ search: "ca", per_page: 10 });
    await userEvent.click(add);

    await waitFor(() =>
      expect(admin.addFeatureUser).toHaveBeenCalledWith("jobs", "201"),
    );
    expect(
      await within(dialog).findByText("carol is on the beta list now."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "carol is on the list" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("marks a user already on the list, and adding one again changes nothing", async () => {
    admin.getUsers.mockResolvedValue(candidates([candidate("101", "alice")]));
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: "Search users" }),
      "alice",
    );

    const listed = await within(dialog).findByRole("button", {
      name: "alice is on the list",
    });
    expect(listed).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(listed);
    expect(admin.addFeatureUser).not.toHaveBeenCalled();
    expect(
      document.querySelectorAll('tr[data-slot="feature-beta-user"]'),
    ).toHaveLength(2);
  });

  it("adding a user who is already listed but not marked is harmless", async () => {
    // bob is on the list (page 2, say) but found by email: neither the page on
    // screen nor the username search of the list can mark him. The PUT is
    // idempotent (204), so the add is a no-op that still reads as success.
    serveList([ALICE]);
    admin.getUsers.mockResolvedValue(
      candidates([{ ...candidate("102", "bob"), email: "robert@corp.dev" }]),
    );
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: "Search users" }),
      "robert",
    );
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Add bob" }),
    );

    await waitFor(() =>
      expect(admin.addFeatureUser).toHaveBeenCalledWith("jobs", "102"),
    );
    expect(
      await within(dialog).findByText("bob is on the beta list now."),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="feature-add-user-error"]'),
    ).toBeNull();
  });

  it("shows the search error and an add failure's detail", async () => {
    admin.getUsers
      .mockRejectedValueOnce(axiosError(500))
      .mockResolvedValue(candidates([candidate("201", "carol")]));
    admin.addFeatureUser.mockRejectedValue(axiosError(404, "User not found"));
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: "Search users" }),
      "carol",
    );
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Could not search users.");
    await userEvent.click(
      within(alert).getByRole("button", { name: "Try again" }),
    );

    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Add carol" }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="feature-add-user-error"]'),
      ).toHaveTextContent("User not found"),
    );
    expect(
      within(dialog).getByRole("button", { name: "Add carol" }),
    ).toBeInTheDocument();
  });

  it("says when no user matches", async () => {
    admin.getUsers.mockResolvedValue(candidates([]));
    renderPage();
    await waitFor(() => expect(betaRow("alice")).not.toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Add user" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: "Search users" }),
      "nobody",
    );
    expect(
      await within(dialog).findByText('No user matches "nobody".'),
    ).toBeInTheDocument();
  });
});

describe("FeatureViewPage — stage (AC5, AC6)", () => {
  it("releases a beta feature only after the confirm; Cancel sends nothing", async () => {
    admin.setFeatureStage.mockResolvedValue({ ...JOBS, stage: "general" });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Release to everyone" }),
    );
    let dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Release Jobs to everyone?");
    expect(dialog).toHaveTextContent(
      "Every user gets Jobs, including admins who turned it off.",
    );
    expect(dialog).toHaveTextContent(
      "The beta list is kept, so you can move it back to beta later.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(admin.setFeatureStage).not.toHaveBeenCalled();

    admin.getFeatures.mockResolvedValue([
      {
        ...JOBS,
        stage: "general",
        released_at: NOON,
        me: { has: true, via: "general", opted_out: false },
      },
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Release to everyone" }),
    );
    dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Release to everyone" }),
    );

    await waitFor(() =>
      expect(admin.setFeatureStage).toHaveBeenCalledWith("jobs", "general"),
    );
    expect(
      await screen.findByRole("button", { name: "Move back to beta" }),
    ).toBeInTheDocument();
    // AC6: the list is untouched and still editable in general.
    expect(betaRow("alice")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Add user" })).toBeVisible();
    expect(admin.removeFeatureUser).not.toHaveBeenCalled();
  });

  it("moves a general feature back to beta after a confirm that warns who loses it", async () => {
    admin.getFeatures.mockResolvedValue([
      {
        ...JOBS,
        stage: "general",
        released_at: NOON,
        me: { has: true, via: "general", opted_out: false },
      },
    ]);
    admin.setFeatureStage.mockResolvedValue(JOBS);
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Move back to beta" }),
    );
    let dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Move Jobs back to beta?");
    expect(
      within(dialog).getByText(
        "Users who are neither on this list nor admins lose access.",
      ),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "The beta list stays as it is, and admins who turned it off lose it again.",
    );
    await userEvent.keyboard("{Escape}");
    expect(admin.setFeatureStage).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Move back to beta" }),
    );
    dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move back to beta" }),
    );
    await waitFor(() =>
      expect(admin.setFeatureStage).toHaveBeenCalledWith("jobs", "beta"),
    );
  });

  it("keeps the dialog open with the server's detail on failure", async () => {
    admin.setFeatureStage.mockRejectedValue(
      axiosError(404, "Feature not found"),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Release to everyone" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Release to everyone" }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="feature-stage-error"]'),
      ).toHaveTextContent("Feature not found"),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("FeatureViewPage — your access (AC8-AC11)", () => {
  it("as an admin: on, with the reason; turning it off PUTs the opt-out", async () => {
    renderPage();

    await waitFor(() => expect(ownSwitch()).toBeChecked());
    expect(reason()).toHaveTextContent(
      "You have this feature because you're an admin.",
    );
    expect(hint()).toHaveTextContent(
      "Turn it off to see the app as users without it do. This changes only what you see.",
    );

    admin.getFeatures.mockResolvedValue([
      { ...JOBS, me: { has: false, via: null, opted_out: true } },
    ]);
    await userEvent.click(ownSwitch());

    expect(admin.optOutFeature).toHaveBeenCalledWith("jobs");
    expect(admin.optInFeature).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(reason()).toHaveTextContent(
        "You don't have this feature because you turned it off.",
      ),
    );
    expect(ownSwitch()).not.toBeChecked();
    expect(ownSwitch()).not.toHaveAttribute("aria-busy");
  });

  it("turned off: the reason, and turning it on DELETEs the opt-out", async () => {
    admin.getFeatures.mockResolvedValue([
      { ...JOBS, me: { has: false, via: null, opted_out: true } },
    ]);
    renderPage();

    await waitFor(() =>
      expect(reason()).toHaveTextContent(
        "You don't have this feature because you turned it off.",
      ),
    );
    expect(ownSwitch()).not.toBeChecked();
    await userEvent.click(ownSwitch());
    expect(admin.optInFeature).toHaveBeenCalledWith("jobs");
    expect(admin.optOutFeature).not.toHaveBeenCalled();
  });

  it("shows the switch busy with the asked-for value while the request runs", async () => {
    let finish: () => void = () => {};
    admin.optOutFeature.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    renderPage();
    await waitFor(() => expect(ownSwitch()).toBeChecked());

    await userEvent.click(ownSwitch());
    await waitFor(() =>
      expect(ownSwitch()).toHaveAttribute("aria-busy", "true"),
    );
    expect(ownSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(ownSwitch()).not.toBeChecked();
    expect(ownSwitch()).toHaveFocus();
    await userEvent.click(ownSwitch());
    expect(admin.optOutFeature).toHaveBeenCalledTimes(1);
    expect(admin.optInFeature).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(ownSwitch()).not.toHaveAttribute("aria-busy"));
  });

  it("general: locked, the stored choice shown, and the words (AC10)", async () => {
    admin.getFeatures.mockResolvedValue([
      {
        ...JOBS,
        stage: "general",
        released_at: NOON,
        me: { has: true, via: "general", opted_out: true },
      },
    ]);
    renderPage();

    await waitFor(() =>
      expect(reason()).toHaveTextContent(
        "You have this feature because it's released to everyone.",
      ),
    );
    expect(hint()).toHaveTextContent(
      "Released to everyone. Your choice applies again if it moves back to beta.",
    );
    expect(ownSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(ownSwitch()).toHaveAttribute("data-lock", "general");
    expect(ownSwitch()).not.toBeChecked();
    await userEvent.click(ownSwitch());
    expect(admin.optOutFeature).not.toHaveBeenCalled();
    expect(admin.optInFeature).not.toHaveBeenCalled();
  });

  it("listed: locked, the stored choice shown, and told to leave the list (AC11)", async () => {
    admin.getFeatures.mockResolvedValue([
      { ...JOBS, me: { has: true, via: "list", opted_out: true } },
    ]);
    renderPage();

    await waitFor(() =>
      expect(reason()).toHaveTextContent(
        "You have this feature because you're on the beta list.",
      ),
    );
    expect(hint()).toHaveTextContent(
      "You're on the beta list, so you keep access. Remove yourself from the list to hide it.",
    );
    expect(ownSwitch()).toHaveAttribute("aria-disabled", "true");
    expect(ownSwitch()).toHaveAttribute("data-lock", "list");
    expect(ownSwitch()).not.toBeChecked();
    await userEvent.click(ownSwitch());
    expect(admin.optOutFeature).not.toHaveBeenCalled();
    expect(admin.optInFeature).not.toHaveBeenCalled();
  });

  it("a failed opt-out toasts the detail and keeps the stored choice", async () => {
    const { toast } = await import("sonner");
    admin.optOutFeature.mockRejectedValue(axiosError(404, "Feature not found"));
    renderPage();
    await waitFor(() => expect(ownSwitch()).toBeChecked());

    await userEvent.click(ownSwitch());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Feature not found"),
    );
    expect(ownSwitch()).toBeChecked();
  });
});
