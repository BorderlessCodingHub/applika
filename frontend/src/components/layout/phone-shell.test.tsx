import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { CycleProvider } from "@/contexts/cycle-context";
import { LocaleProvider } from "@/i18n/locale-provider";
import type { MyFeature } from "@/services/types/features";
import type { User } from "@/services/types/users";
import { mockPhoneViewport } from "@/test/phone";
import { AppShell } from "./app-shell";
import { navItemsFor } from "./nav";
import {
  PHONE_PARENTS,
  PHONE_SCREEN_PATHS,
  TAB_ROOTS,
  accountRows,
  phoneBackFor,
} from "./phone-nav";

vi.mock("@/services/services", () => ({
  services: {
    cycles: { getCycles: () => Promise.resolve([]) },
    sessions: { list: () => Promise.resolve([]) },
    users: { getAgenda: () => Promise.resolve([]) },
  },
}));

// Today's create sheet fills the quick-add slot; its form is tested on its own.
const { sheetRendered } = vi.hoisted(() => ({ sheetRendered: vi.fn() }));
vi.mock("@/components/applications/application-form-sheet", () => ({
  ApplicationFormSheet: ({ open }: { open: boolean }) => {
    sheetRendered(open);
    return open ? <div role="dialog" aria-label="New Application" /> : null;
  },
}));

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

  it.each(["/dashboard", "/applications", "/agenda"])(
    "shows the initials on %s, opening the Account hub",
    (path) => {
      mockPhoneViewport();
      renderShell(path);

      const avatar = screen.getByRole("link", { name: "Account" });
      expect(avatar).toHaveAttribute("href", "/account");
      expect(avatar).toHaveTextContent("SC");
      // An interim row: today's page keeps its own h1, so the row adds none.
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    },
  );

  it("takes the initials from the username without a first name", () => {
    mockPhoneViewport();
    renderShell("/dashboard", {
      user: { ...USER, first_name: undefined, last_name: undefined },
    });

    expect(screen.getByRole("link", { name: "Account" })).toHaveTextContent(
      "SC",
    );
  });

  it.each(["/account", "/jobs", "/welcome"])(
    "puts no avatar row on %s",
    (path) => {
      mockPhoneViewport();
      renderShell(path);

      expect(document.querySelector('[data-slot="phone-avatar"]')).toBeNull();
    },
  );

  it.each(["/dashboard", "/applications"])(
    "offers Add on %s, which opens the create sheet",
    async (path) => {
      mockPhoneViewport();
      const user = userEvent.setup();
      renderShell(path);

      const add = screen.getByRole("button", { name: "Add" });
      expect(add).toHaveAttribute("aria-haspopup", "dialog");
      expect(
        screen.queryByRole("dialog", { name: "New Application" }),
      ).not.toBeInTheDocument();

      await user.click(add);
      expect(
        screen.getByRole("dialog", { name: "New Application" }),
      ).toBeInTheDocument();
    },
  );

  it("mounts the create sheet only once Add is pressed, so it fetches nothing before", async () => {
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

  it("pads today's content and keeps it clear of the tab bar and FAB", () => {
    mockPhoneViewport();
    renderShell("/dashboard");
    const slot = document.querySelector('[data-slot="app-content"]')!;

    expect(slot.className).toContain("px-4");
    expect(slot.className).toContain(
      "pb-[calc(170px+env(safe-area-inset-bottom,0px))]",
    );
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
    renderShell("/jobs");

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

  it("reserves the tab bar alone on Agenda and 40px elsewhere", () => {
    mockPhoneViewport();
    const { unmount } = renderShell("/agenda");
    expect(
      document.querySelector('[data-slot="app-content"]')!.className,
    ).toContain("pb-[calc(110px+env(safe-area-inset-bottom,0px))]");
    unmount();

    renderShell("/jobs");
    expect(
      document.querySelector('[data-slot="app-content"]')!.className,
    ).toContain("pb-10");
  });

  it.each([...PHONE_SCREEN_PATHS])(
    "adds no padding around the ported %s screen",
    (path) => {
      mockPhoneViewport();
      renderShell(path);
      const slot = document.querySelector('[data-slot="app-content"]')!;

      expect(slot.className).not.toMatch(/(^|\s)(px|pt|pb|py)-/);
    },
  );

  it("switches to today's shell when the screen turns past md, losing the quick add", async () => {
    const viewport = mockPhoneViewport();
    const user = userEvent.setup();
    renderShell("/dashboard");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByRole("dialog", { name: "New Application" }),
    ).toBeInTheDocument();

    viewport.setPhone(false);

    expect(document.querySelector("aside")).not.toBeNull();
    // The rail's own nav is "Primary" too: look for the tab bar itself.
    expect(document.querySelector('[data-slot="phone-tab-bar"]')).toBeNull();
    expect(
      screen.queryByRole("dialog", { name: "New Application" }),
    ).not.toBeInTheDocument();

    viewport.setPhone(true);
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "New Application" }),
    ).not.toBeInTheDocument();
  });
});

describe("phone-nav", () => {
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
