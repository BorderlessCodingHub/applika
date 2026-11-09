import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CycleProvider, useCycleContext } from "@/contexts/cycle-context";
import { LocaleProvider } from "@/i18n/locale-provider";
import type { MyFeature } from "@/services/types/features";
import type { User } from "@/services/types/users";
import { mockPhoneViewport } from "@/test/phone";
import { AppShell } from "./app-shell";
import { navItemsFor } from "./nav";
import { PhoneChromeless, PhoneTopBarEnd, usePhoneShell } from "./phone-shell";
import {
  PHONE_PARENTS,
  PHONE_SCREEN_PATHS,
  TAB_ROOTS,
  accountRows,
  isPhoneScreen,
  phoneBackFor,
} from "./phone-nav";

vi.mock("@/services/services", () => ({
  services: {
    cycles: { getCycles: () => Promise.resolve([]) },
    sessions: { list: () => Promise.resolve([]) },
    users: { getAgenda: () => Promise.resolve([]) },
  },
}));

// The quick-add sheet fills the FAB's slot; its form is tested on its own
// (quick-add-sheet.test.tsx).
const { sheetRendered } = vi.hoisted(() => ({ sheetRendered: vi.fn() }));
vi.mock("@/components/phone/screens/quick-add-sheet", () => ({
  QuickAddSheet: ({ open }: { open: boolean }) => {
    sheetRendered(open);
    return open ? <div role="dialog" aria-label="Add application" /> : null;
  },
}));

/** A past cycle for the archived-cycle cases. */
function PickPastCycle() {
  const { setSelectedCycleId } = useCycleContext();
  return (
    <button type="button" onClick={() => setSelectedCycleId("c2")}>
      pick past cycle
    </button>
  );
}

/** A screen asking the shell for the quick add, as the Pipeline's empty state does. */
function CreateFirst() {
  const { openQuickAdd } = usePhoneShell();
  return (
    <button type="button" onClick={openQuickAdd}>
      create first
    </button>
  );
}

const USER: User = {
  id: "u1",
  username: "scarter",
  email: "sam@example.com",
  first_name: "Sam",
  last_name: "Carter",
  github_id: null,
  badges: [],
  borderless: null,
  github_restore: { available: false, prompt: false },
};

const BOTH: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "beta" },
];

function renderShell(
  path: string,
  {
    navItems = navItemsFor(false, BOTH, { hasReportsBadge: true }),
    user = USER,
    children = <p>page content</p>,
  }: {
    navItems?: ReturnType<typeof navItemsFor>;
    user?: User | null;
    children?: ReactNode;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CycleProvider>
        <AppShell
          activePath={path}
          navItems={navItems}
          user={user}
          onLogout={vi.fn()}
        >
          {children}
        </AppShell>
      </CycleProvider>
    </QueryClientProvider>,
    // The desktop header holds the language switcher.
    { wrapper: LocaleProvider },
  );
}

const TAB_PATHS = ["/dashboard", "/applications", "/agenda", "/insights"];

describe("AppShell at md and up", () => {
  it("renders today's shell: the rail, the menu button, no tab bar", () => {
    renderShell("/dashboard");

    expect(document.querySelector("aside")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Open navigation menu" }),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-slot="phone-tab-bar"]')).toBeNull();
    expect(document.querySelector('[data-slot="phone-shell"]')).toBeNull();
  });
});

describe("PhoneShell below md", () => {
  it("shows no rail and no navigation menu", () => {
    mockPhoneViewport();
    renderShell("/dashboard");

    expect(document.querySelector("aside")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Open navigation menu" }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="phone-shell"]')).not.toBeNull();
  });

  it("keeps the root positioned and out of the stacking contract", () => {
    mockPhoneViewport();
    renderShell("/dashboard");
    const root = document.querySelector<HTMLElement>(
      '[data-slot="phone-shell"]',
    )!;

    expect(root.className).toContain("relative");
    expect(root.className).toContain("h-viewport");
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).not.toMatch(
      /(^|\s)(z-\S+|isolate|transform|filter)(\s|$)/,
    );
  });

  it("has exactly one main, scrolling, holding the app-content slot and the page", () => {
    mockPhoneViewport();
    renderShell("/jobs");

    const mains = screen.getAllByRole("main");
    expect(mains).toHaveLength(1);
    expect(mains[0].className).toContain("overflow-y-auto");
    // The boards' `.scroll`: no visible scrollbar.
    expect(mains[0].className).toContain("ph-scroll");
    const slot = mains[0].querySelector('[data-slot="app-content"]');
    expect(slot).not.toBeNull();
    expect(within(slot as HTMLElement).getByText("page content")).toBeVisible();
  });

  it.each(TAB_PATHS)(
    "shows the four tabs on %s, marking only that one",
    (path) => {
      mockPhoneViewport();
      renderShell(path);

      const nav = screen.getByRole("navigation", { name: "Primary" });
      const tabs = within(nav).getAllByRole("link");
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        "Today",
        "Pipeline",
        "Agenda",
        "Insights",
      ]);
      expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual(TAB_PATHS);
      const current = tabs.filter(
        (tab) => tab.getAttribute("aria-current") === "page",
      );
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute("href", path);
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    },
  );

  it.each([
    "/account",
    "/jobs",
    "/cvs/new",
    "/reports/3",
    "/admin/users",
    "/welcome",
  ])("shows no tab bar on %s", (path) => {
    mockPhoneViewport();
    renderShell(path);

    expect(
      screen.queryByRole("navigation", { name: "Primary" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["/account", "Back", "/dashboard"],
    ["/jobs", "Account", "/account"],
    ["/jobs/", "Account", "/account"],
    ["/cvs", "Account", "/account"],
    ["/cycles", "Account", "/account"],
    ["/reports", "Account", "/account"],
    ["/profile", "Account", "/account"],
    ["/device", "Account", "/account"],
    ["/admin", "Account", "/account"],
    ["/admin/users", "Account", "/account"],
    ["/admin/report-webhooks", "Account", "/account"],
    ["/jobs/view", "Jobs", "/jobs"],
    ["/cvs/editor", "CVs", "/cvs"],
    ["/reports/7", "Reports", "/reports"],
    ["/applications/new-with-cv", "Applications", "/applications"],
    ["/cvs/new", "CVs", "/cvs"],
    ["/applications/cv", "Pipeline", "/applications"],
    ["/admin/features/view", "Features", "/admin/features"],
    ["/admin/supports", "Admin", "/admin"],
    ["/admin/discord-webhooks", "Admin", "/admin"],
  ])("puts a back link on %s named %s, to %s", (path, label, href) => {
    mockPhoneViewport();
    renderShell(path);

    const bar = screen.getByRole("banner");
    const links = within(bar).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(label);
    expect(links[0]).toHaveAttribute("href", href);
    // Above the one <main>, never inside it.
    expect(screen.getByRole("main").contains(bar)).toBe(false);
  });

  it.each([...TAB_PATHS, "/welcome"])("puts no back bar on %s", (path) => {
    mockPhoneViewport();
    renderShell(path);

    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it.each(["/dashboard", "/applications", "/agenda", "/insights"])(
    "draws no interim avatar row on %s: the board's header carries it",
    (path) => {
      mockPhoneViewport();
      renderShell(path);

      expect(document.querySelector('[data-slot="phone-avatar"]')).toBeNull();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    },
  );

  it.each(["/account", "/jobs", "/welcome"])(
    "puts no avatar row on %s",
    (path) => {
      mockPhoneViewport();
      renderShell(path);

      expect(document.querySelector('[data-slot="phone-avatar"]')).toBeNull();
    },
  );

  it.each(["/dashboard", "/applications"])(
    "offers Add on %s, which opens the quick-add sheet",
    async (path) => {
      mockPhoneViewport();
      const user = userEvent.setup();
      renderShell(path);

      const add = screen.getByRole("button", { name: "Add" });
      expect(add).toHaveAttribute("aria-haspopup", "dialog");
      expect(
        screen.queryByRole("dialog", { name: "Add application" }),
      ).not.toBeInTheDocument();

      await user.click(add);
      expect(
        screen.getByRole("dialog", { name: "Add application" }),
      ).toBeInTheDocument();
    },
  );

  it("opens the quick add for a screen that asks (openQuickAdd)", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    renderShell("/applications", { children: <CreateFirst /> });

    await user.click(screen.getByRole("button", { name: "create first" }));
    expect(
      screen.getByRole("dialog", { name: "Add application" }),
    ).toBeInTheDocument();
  });

  it("hides Add on an archived cycle's Pipeline, and keeps it on Today", async () => {
    mockPhoneViewport();
    const user = userEvent.setup();
    const { unmount } = renderShell("/applications", {
      children: <PickPastCycle />,
    });
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "pick past cycle" }));
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    // The tab bar stays: the archived Pipeline is still a tab root.
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main").className).toContain(
      "scroll-pb-[calc(110px+env(safe-area-inset-bottom,0px))]",
    );
    unmount();

    renderShell("/dashboard", { children: <PickPastCycle /> });
    await user.click(screen.getByRole("button", { name: "pick past cycle" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("draws no tab bar, no FAB and no reservation while a screen is chromeless", () => {
    mockPhoneViewport();
    const { rerender } = renderShell("/applications", {
      children: <PhoneChromeless />,
    });

    expect(document.querySelector('[data-slot="phone-tab-bar"]')).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("main").className).not.toContain("scroll-pb-");
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();

    // The marker gone (back to the list): the chrome is back.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <CycleProvider>
          <AppShell
            activePath="/applications"
            navItems={navItemsFor(false, BOTH, { hasReportsBadge: true })}
            user={USER}
            onLogout={vi.fn()}
          >
            <p>page content</p>
          </AppShell>
        </CycleProvider>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("mounts the quick-add sheet only once Add is pressed, so it fetches nothing before", async () => {
    mockPhoneViewport();
    sheetRendered.mockClear();
    const user = userEvent.setup();
    renderShell("/dashboard");

    expect(sheetRendered).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(sheetRendered).toHaveBeenLastCalledWith(true);
  });

  it.each(["/agenda", "/insights", "/account", "/applications/cv"])(
    "offers no Add on %s",
    (path) => {
      mockPhoneViewport();
      renderShell(path);

      expect(
        screen.queryByRole("button", { name: "Add" }),
      ).not.toBeInTheDocument();
    },
  );

  it("pads a screen without a board with today's padding", () => {
    mockPhoneViewport();
    renderShell("/cvs/new");
    const slot = document.querySelector('[data-slot="app-content"]')!;

    expect(slot.className).toContain("px-4");
    expect(slot.className).toContain("pt-6");
  });

  it.each([
    ["/dashboard", "scroll-pb-[calc(170px+env(safe-area-inset-bottom,0px))]"],
    [
      "/applications",
      "scroll-pb-[calc(170px+env(safe-area-inset-bottom,0px))]",
    ],
    ["/agenda", "scroll-pb-[calc(110px+env(safe-area-inset-bottom,0px))]"],
    ["/insights", "scroll-pb-[calc(110px+env(safe-area-inset-bottom,0px))]"],
  ])(
    "keeps a focused control on %s scrolled clear of the fixed chrome",
    (path, scrollPadding) => {
      mockPhoneViewport();
      renderShell(path);

      expect(screen.getByRole("main").className).toContain(scrollPadding);
    },
  );

  it("adds no scroll padding where no chrome is fixed", () => {
    mockPhoneViewport();
    renderShell("/cvs/new");

    expect(screen.getByRole("main").className).not.toContain("scroll-pb-");
  });

  it("puts the FAB before the tab bar, as the boards do", () => {
    mockPhoneViewport();
    renderShell("/dashboard");
    const fab = screen.getByRole("button", { name: "Add" });
    const bar = screen.getByRole("navigation", { name: "Primary" });

    expect(
      fab.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leaves the four tab roots' bottom room to their boards, and reserves 40px elsewhere", () => {
    mockPhoneViewport();
    for (const path of TAB_PATHS) {
      const { unmount } = renderShell(path);
      expect(
        document.querySelector('[data-slot="app-content"]')!.className,
      ).not.toMatch(/(^|\s)pb-/);
      unmount();
    }

    renderShell("/cvs/new");
    expect(
      document.querySelector('[data-slot="app-content"]')!.className,
    ).toContain("pb-10");
  });

  it.each([
    ...PHONE_SCREEN_PATHS,
    "/reports/14",
    "/admin/users",
    "/admin/features/view",
  ])("adds no padding around the ported %s screen", (path) => {
    mockPhoneViewport();
    renderShell(path);
    const slot = document.querySelector('[data-slot="app-content"]')!;

    expect(slot.className).not.toMatch(/(^|\s)(px|pt|pb|py)-/);
  });

  it("switches to today's shell when the screen turns past md, losing the quick add", async () => {
    const viewport = mockPhoneViewport();
    const user = userEvent.setup();
    renderShell("/dashboard");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByRole("dialog", { name: "Add application" }),
    ).toBeInTheDocument();

    viewport.setPhone(false);

    expect(document.querySelector("aside")).not.toBeNull();
    // The rail's own nav is "Primary" too: look for the tab bar itself.
    expect(document.querySelector('[data-slot="phone-tab-bar"]')).toBeNull();
    expect(
      screen.queryByRole("dialog", { name: "Add application" }),
    ).not.toBeInTheDocument();

    viewport.setPhone(true);
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Add application" }),
    ).not.toBeInTheDocument();
  });
});

describe("PhoneTopBarEnd", () => {
  it("puts a screen's item at the right of the back bar, before main", () => {
    mockPhoneViewport();
    renderShell("/profile", {
      children: (
        <PhoneTopBarEnd>
          <button type="button">Edit</button>
        </PhoneTopBarEnd>
      ),
    });

    const edit = screen.getByRole("button", { name: "Edit" });
    const bar = screen.getByRole("banner");
    expect(
      bar.querySelector('[data-slot="phone-top-bar-end"]'),
    ).toContainElement(edit);
    // The back link stays the bar's only link, and comes first.
    expect(within(bar).getAllByRole("link")).toHaveLength(1);
    expect(
      within(bar)
        .getByRole("link", { name: "Account" })
        .compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      edit.compareDocumentPosition(screen.getByRole("main")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders nothing on a tab root, which has no back bar", () => {
    mockPhoneViewport();
    renderShell("/dashboard", {
      children: (
        <PhoneTopBarEnd>
          <button type="button">Edit</button>
        </PhoneTopBarEnd>
      ),
    });

    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
  });

  it("renders in place outside the shell (a screen tested alone)", () => {
    render(
      <PhoneTopBarEnd>
        <button type="button">Edit</button>
      </PhoneTopBarEnd>,
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});

describe("phone-nav", () => {
  it("treats every report day, every admin section and the job, CV and draft boards as ported", () => {
    for (const path of [
      "/profile",
      "/cycles",
      "/reports",
      "/reports/14",
      "/admin",
      "/admin/",
      "/admin/jobs",
      "/admin/users",
      "/admin/features/view",
      "/jobs",
      "/jobs/view",
      "/cvs",
      "/cvs/editor",
      "/applications/new-with-cv",
    ]) {
      expect(isPhoneScreen(path), path).toBe(true);
    }
    for (const path of [
      "/cvs/new",
      "/applications/cv",
      "/jobsx",
      "/reportsx",
      "/administrator",
    ]) {
      expect(isPhoneScreen(path), path).toBe(false);
    }
  });

  it("lists the four tab roots in the board's order", () => {
    expect(TAB_ROOTS.map((root) => [root.href, root.label])).toEqual([
      ["/dashboard", "Today"],
      ["/applications", "Pipeline"],
      ["/agenda", "Agenda"],
      ["/insights", "Insights"],
    ]);
  });

  it("maps the screens without a board to their parents", () => {
    expect(
      Object.entries(PHONE_PARENTS).map(([path, back]) => [path, back.href]),
    ).toEqual([
      ["/cvs/new", "/cvs"],
      ["/applications/cv", "/applications"],
      ["/admin/features/view", "/admin/features"],
      ["/admin/supports", "/admin"],
      ["/admin/discord-webhooks", "/admin"],
    ]);
  });

  it("sends an address no map names back to Today", () => {
    expect(phoneBackFor("/somewhere/new")).toMatchObject({
      href: "/dashboard",
      label: "Back",
    });
  });

  const rows = (
    isAdmin: boolean,
    features: MyFeature[],
    hasReportsBadge: boolean,
  ) => accountRows(navItemsFor(isAdmin, features, { hasReportsBadge }));

  it("lists the workspace in order, with Beta while a feature is in beta", () => {
    const { workspace } = rows(false, BOTH, true);
    expect(workspace.map((row) => [row.label, row.href, row.beta])).toEqual([
      ["Jobs", "/jobs", true],
      ["CVs", "/cvs", true],
      ["Reports", "/reports", false],
      ["Cycles", "/cycles", false],
    ]);
    expect(workspace.every((row) => row.icon)).toBe(true);
  });

  it("drops Beta once a feature is released", () => {
    const { workspace } = rows(
      false,
      [
        { key: "jobs", stage: "general" },
        { key: "cvs", stage: "beta" },
      ],
      false,
    );
    expect(workspace.map((row) => [row.key, row.beta])).toEqual([
      ["jobs", false],
      ["cvs", true],
      ["cycles", false],
    ]);
  });

  it("shows a feature's row only with the feature, and Reports only with a badge", () => {
    expect(rows(false, [], false).workspace.map((row) => row.key)).toEqual([
      "cycles",
    ]);
    expect(
      rows(false, [{ key: "cvs", stage: "beta" }], true).workspace.map(
        (row) => row.key,
      ),
    ).toEqual(["cvs", "reports", "cycles"]);
  });

  it("drops a row when its feature is taken away", () => {
    const before = rows(false, BOTH, true).workspace.map((row) => row.key);
    const after = rows(
      false,
      [{ key: "cvs", stage: "beta" }],
      true,
    ).workspace.map((row) => row.key);
    expect(before).toContain("jobs");
    expect(after).not.toContain("jobs");
  });

  it("lists Admin for an admin only, with the account entries everyone has", () => {
    expect(
      rows(false, BOTH, true).account.map((row) => [row.label, row.href]),
    ).toEqual([
      ["Profile", "/profile"],
      ["Devices & CLI", "/profile?tab=devices"],
      ["Sign in a device", "/device"],
    ]);
    expect(rows(true, BOTH, true).account.map((row) => row.key)).toEqual([
      "profile",
      "devices",
      "device",
      "admin",
    ]);
  });
});
