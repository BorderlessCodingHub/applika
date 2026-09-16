import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Briefcase } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_NAV,
  PRIMARY_NAV,
  isNavItemActive,
  navItemsFor,
  type NavItem,
} from "./nav";
import { SidebarNav } from "./sidebar-nav";

/**
 * Shell navigation (KODI-004 / R-017, R-020).
 *
 * Two properties hang off this file:
 *  - criterion 3 — exactly one entry is marked as the current page, and it is
 *    the right one for the pathname the (protected) layout hands down;
 *  - criterion 4 — the Admin entry exists for an admin and for nobody else.
 *
 * The active entry is asserted through `aria-current="page"`, never through a
 * class name, so the assertions survive a repaint.
 */

const hrefsOf = (items: NavItem[]) => items.map((item) => item.href);

function renderNav(activePath: string, items: NavItem[] = PRIMARY_NAV) {
  return render(<SidebarNav items={items} activePath={activePath} />);
}

/** Every link the nav rendered, in DOM order. */
function renderedLinks() {
  return screen
    .getByRole("navigation", { name: "Primary" })
    .querySelectorAll("a");
}

describe("isNavItemActive", () => {
  const dashboard = PRIMARY_NAV.find((item) => item.href === "/dashboard")!;
  const applications = PRIMARY_NAV.find(
    (item) => item.href === "/applications",
  )!;

  it("marks an exact item active only on its own pathname", () => {
    expect(dashboard.exact).toBe(true);
    expect(isNavItemActive(dashboard, "/dashboard")).toBe(true);
  });

  it("does not mark an exact item active on a descendant pathname", () => {
    // `/dashboard` is `exact` precisely so a nested route never lights it up.
    expect(isNavItemActive(dashboard, "/dashboard/anything")).toBe(false);
  });

  it("marks a prefix item active on a descendant pathname", () => {
    expect(isNavItemActive(applications, "/applications")).toBe(true);
    expect(isNavItemActive(applications, "/applications/123")).toBe(true);
  });

  it("marks the admin item active on a nested admin pathname", () => {
    expect(isNavItemActive(ADMIN_NAV, "/admin")).toBe(true);
    expect(isNavItemActive(ADMIN_NAV, "/admin/users")).toBe(true);
  });

  it("requires a path separator, so a sibling prefix never leaks", () => {
    // The trailing slash in the prefix test is what stops `/reports` lighting
    // up a `/report` entry, and `/report` lighting up the `/reports` entry.
    const report: NavItem = {
      href: "/report",
      label: "Report",
      icon: Briefcase,
    };
    const reports = PRIMARY_NAV.find((item) => item.href === "/reports")!;

    expect(isNavItemActive(report, "/reports")).toBe(false);
    expect(isNavItemActive(reports, "/report")).toBe(false);
    expect(isNavItemActive(reports, "/reportsomething")).toBe(false);

    // The control: both still match their own subtree.
    expect(isNavItemActive(report, "/report/7")).toBe(true);
    expect(isNavItemActive(reports, "/reports/7")).toBe(true);
  });
});

describe("navItemsFor", () => {
  it("hides the admin entry from a non-admin", () => {
    expect(hrefsOf(navItemsFor(false))).not.toContain("/admin");
  });

  it("hides the admin entry while is_admin is still unknown", () => {
    // `user?.is_admin` is `undefined` for the frame before the profile lands
    // and for any user the API returns without the flag.
    expect(hrefsOf(navItemsFor(undefined))).not.toContain("/admin");
  });

  it("appends the admin entry last for an admin", () => {
    const items = navItemsFor(true);

    expect(hrefsOf(items)).toContain("/admin");
    expect(items.at(-1)).toBe(ADMIN_NAV);
    expect(items).toHaveLength(PRIMARY_NAV.length + 1);
  });

  it("keeps every primary entry in order for both identities", () => {
    expect(hrefsOf(navItemsFor(false))).toEqual(hrefsOf(PRIMARY_NAV));
    expect(hrefsOf(navItemsFor(true)).slice(0, PRIMARY_NAV.length)).toEqual(
      hrefsOf(PRIMARY_NAV),
    );
  });

  it("never mutates PRIMARY_NAV when it appends the admin entry", () => {
    const before = hrefsOf(PRIMARY_NAV);
    navItemsFor(true);
    expect(hrefsOf(PRIMARY_NAV)).toEqual(before);
  });
});

describe("SidebarNav rendering", () => {
  it("marks exactly one entry as the current page", () => {
    renderNav("/applications/123", navItemsFor(true));

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName("Applications");
  });

  it("marks no entry as the current page on an unmatched pathname", () => {
    renderNav("/somewhere-else", navItemsFor(true));

    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(0);
  });

  it("renders no Admin link for a non-admin", () => {
    renderNav("/dashboard", navItemsFor(false));

    // A bare string `name` is a full-string match in Testing Library, so this
    // is the same "exactly Admin" the e2e admin-gating spec asserts.
    expect(
      screen.queryByRole("link", { name: "Admin" }),
    ).not.toBeInTheDocument();
  });

  it("renders an Admin link named exactly Admin for an admin", () => {
    renderNav("/admin/users", navItemsFor(true));

    const admin = screen.getByRole("link", { name: "Admin" });
    expect(admin).toHaveAttribute("href", "/admin");
    expect(admin).toHaveAttribute("aria-current", "page");
  });

  it("exposes the nav under a Primary landmark, in display order", () => {
    renderNav("/dashboard", navItemsFor(true));

    expect(
      Array.from(renderedLinks()).map((link) => link.getAttribute("href")),
    ).toEqual(hrefsOf(navItemsFor(true)));
  });

  it("labels the admin group so the entry reads as privileged", () => {
    renderNav("/dashboard", navItemsFor(true));

    // The amber treatment is gone; position under a "System" divider is what
    // signals the entry now, so the label has to actually be rendered.
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("announces the group label with the entry it qualifies", () => {
    renderNav("/dashboard", navItemsFor(true));

    const admin = screen.getByRole("link", { name: "Admin" });
    const label = screen.getByText("System");

    // The label is the ONLY privilege signal left now that the amber treatment
    // is gone, so it must not be `aria-hidden` and must be tied to the entry.
    expect(label).not.toHaveAttribute("aria-hidden");
    expect(admin).toHaveAttribute("aria-describedby", label.id);
    // Describing must not rename: `admin-gating.spec.ts` asserts "Admin" exactly.
    expect(admin).toHaveAccessibleName("Admin");
    expect(admin).toHaveAccessibleDescription("System");
  });

  it("keeps group label ids unique when two navs are mounted at once", () => {
    // Below `md` the desktop rail is `display:none` but still MOUNTED, so with
    // the mobile sheet open two SidebarNavs render together. A module-level id
    // would be duplicate HTML and would point the sheet's entry at the hidden
    // rail's label.
    render(
      <>
        <SidebarNav items={navItemsFor(true)} activePath="/dashboard" />
        <SidebarNav items={navItemsFor(true)} activePath="/dashboard" />
      </>,
    );

    const labels = screen.getAllByText("System");
    const admins = screen.getAllByRole("link", { name: "Admin" });
    expect(labels).toHaveLength(2);
    expect(admins).toHaveLength(2);

    expect(labels[0].id).not.toBe(labels[1].id);
    // Each entry points at ITS OWN label, not at the first one in the document.
    expect(admins[0]).toHaveAttribute("aria-describedby", labels[0].id);
    expect(admins[1]).toHaveAttribute("aria-describedby", labels[1].id);
  });

  it("describes an ungrouped entry with nothing at all", () => {
    renderNav("/dashboard", navItemsFor(true));

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("renders no group divider when the admin entry is absent", () => {
    renderNav("/dashboard", navItemsFor(false));

    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("notifies the consumer when an entry is chosen, so the sheet can close", async () => {
    const onNavigate = vi.fn();
    render(
      // jsdom cannot navigate; swallowing the default on the way up keeps the
      // click a real click without the "navigation not implemented" noise.
      <div onClick={(event) => event.preventDefault()}>
        <SidebarNav
          items={navItemsFor(false)}
          activePath="/dashboard"
          onNavigate={onNavigate}
        />
      </div>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Agenda" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
