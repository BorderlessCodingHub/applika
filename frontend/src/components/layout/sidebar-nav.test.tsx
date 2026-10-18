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
import type { MyFeature } from "@/services/types/features";

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

/** The cases written before PRD 0013 run with `jobs` and `cvs` released: 8 entries, no badge. */
const ALL_GENERAL: MyFeature[] = [
  { key: "jobs", stage: "general" },
  { key: "cvs", stage: "general" },
];
/** `jobs` in beta, `cvs` released: 8 entries, the one badge on Jobs. */
const JOBS_BETA: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "general" },
];
const CVS_GENERAL: MyFeature[] = [{ key: "cvs", stage: "general" }];
const JOBS_ONLY: MyFeature[] = [{ key: "jobs", stage: "general" }];
const CVS_BETA: MyFeature[] = [{ key: "cvs", stage: "beta" }];
const BOTH_BETA: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "beta" },
];
const NO_FEATURES: MyFeature[] = [];

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
    expect(hrefsOf(navItemsFor(false, ALL_GENERAL))).not.toContain("/admin");
  });

  it("hides the admin entry while is_admin is still unknown", () => {
    // `user?.is_admin` is `undefined` for the frame before the profile lands
    // and for any user the API returns without the flag.
    expect(hrefsOf(navItemsFor(undefined, ALL_GENERAL))).not.toContain(
      "/admin",
    );
  });

  it("appends the admin entry last for an admin", () => {
    const items = navItemsFor(true, ALL_GENERAL);

    expect(hrefsOf(items)).toContain("/admin");
    expect(items.at(-1)).toBe(ADMIN_NAV);
    expect(items).toHaveLength(PRIMARY_NAV.length + 1);
  });

  it("keeps every primary entry in order for both identities", () => {
    expect(hrefsOf(navItemsFor(false, ALL_GENERAL))).toEqual(
      hrefsOf(PRIMARY_NAV),
    );
    expect(
      hrefsOf(navItemsFor(true, ALL_GENERAL)).slice(0, PRIMARY_NAV.length),
    ).toEqual(hrefsOf(PRIMARY_NAV));
  });

  it("never mutates PRIMARY_NAV when it appends the admin entry", () => {
    const before = hrefsOf(PRIMARY_NAV);
    navItemsFor(true, ALL_GENERAL);
    expect(hrefsOf(PRIMARY_NAV)).toEqual(before);
  });
});

describe("SidebarNav rendering", () => {
  it("marks exactly one entry as the current page", () => {
    renderNav("/applications/123", navItemsFor(true, ALL_GENERAL));

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName("Applications");
  });

  it("marks no entry as the current page on an unmatched pathname", () => {
    renderNav("/somewhere-else", navItemsFor(true, ALL_GENERAL));

    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(0);
  });

  it("renders no Admin link for a non-admin", () => {
    renderNav("/dashboard", navItemsFor(false, ALL_GENERAL));

    // A bare string `name` is a full-string match in Testing Library, so this
    // is the same "exactly Admin" the e2e admin-gating spec asserts.
    expect(
      screen.queryByRole("link", { name: "Admin" }),
    ).not.toBeInTheDocument();
  });

  it("renders an Admin link named exactly Admin for an admin", () => {
    renderNav("/admin/users", navItemsFor(true, ALL_GENERAL));

    const admin = screen.getByRole("link", { name: "Admin" });
    expect(admin).toHaveAttribute("href", "/admin");
    expect(admin).toHaveAttribute("aria-current", "page");
  });

  it("exposes the nav under a Primary landmark, in display order", () => {
    renderNav("/dashboard", navItemsFor(true, ALL_GENERAL));

    expect(
      Array.from(renderedLinks()).map((link) => link.getAttribute("href")),
    ).toEqual(hrefsOf(navItemsFor(true, ALL_GENERAL)));
  });

  it("labels the admin group so the entry reads as privileged", () => {
    renderNav("/dashboard", navItemsFor(true, ALL_GENERAL));

    // The amber treatment is gone; position under a "System" divider is what
    // signals the entry now, so the label has to actually be rendered.
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("announces the group label with the entry it qualifies", () => {
    renderNav("/dashboard", navItemsFor(true, ALL_GENERAL));

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
        <SidebarNav
          items={navItemsFor(true, ALL_GENERAL)}
          activePath="/dashboard"
        />
        <SidebarNav
          items={navItemsFor(true, ALL_GENERAL)}
          activePath="/dashboard"
        />
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
    renderNav("/dashboard", navItemsFor(true, ALL_GENERAL));

    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("renders no group divider when the admin entry is absent", () => {
    renderNav("/dashboard", navItemsFor(false, ALL_GENERAL));

    expect(screen.queryByText("System")).not.toBeInTheDocument();
  });

  it("notifies the consumer when an entry is chosen, so the sheet can close", async () => {
    const onNavigate = vi.fn();
    render(
      // jsdom cannot navigate; swallowing the default on the way up keeps the
      // click a real click without the "navigation not implemented" noise.
      <div onClick={(event) => event.preventDefault()}>
        <SidebarNav
          items={navItemsFor(false, ALL_GENERAL)}
          activePath="/dashboard"
          onNavigate={onNavigate}
        />
      </div>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Agenda" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("the Jobs entry (KODI-048, Plan corrections 8)", () => {
  const jobs = PRIMARY_NAV.find((item) => item.href === "/jobs")!;

  it("sits in the primary nav, labelled Jobs, right after Applications", () => {
    expect(jobs).toBeDefined();
    expect(jobs.label).toBe("Jobs");
    expect(hrefsOf(PRIMARY_NAV).indexOf("/jobs")).toBe(
      hrefsOf(PRIMARY_NAV).indexOf("/applications") + 1,
    );
  });

  it("makes the primary nav eight entries, in the pinned order", () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Applications",
      "Jobs",
      "CVs",
      "Agenda",
      "Reports",
      "Cycles",
      "Profile",
    ]);
  });

  it("stays lit on the job detail route under it", () => {
    expect(isNavItemActive(jobs, "/jobs")).toBe(true);
    expect(isNavItemActive(jobs, "/jobs/view")).toBe(true);
    expect(isNavItemActive(jobs, "/jobsearch")).toBe(false);
  });
});

describe("the CVs entry (KODI-002 / R-001)", () => {
  const cvs = PRIMARY_NAV.find((item) => item.href === "/cvs")!;

  it("sits in the primary nav, labelled CVs, right after Jobs", () => {
    expect(cvs).toBeDefined();
    expect(cvs.label).toBe("CVs");
    expect(hrefsOf(PRIMARY_NAV).indexOf("/cvs")).toBe(
      hrefsOf(PRIMARY_NAV).indexOf("/jobs") + 1,
    );
  });

  it("stays lit on the create and editor routes under it", () => {
    // Not `exact`: `/cvs/new` and `/cvs/editor` are the same feature.
    expect(cvs.exact).toBeUndefined();
    expect(isNavItemActive(cvs, "/cvs")).toBe(true);
    expect(isNavItemActive(cvs, "/cvs/new")).toBe(true);
    expect(isNavItemActive(cvs, "/cvs/editor")).toBe(true);
  });

  it("does not light up a sibling route that merely starts the same way", () => {
    expect(isNavItemActive(cvs, "/cvsomething")).toBe(false);
  });

  it("is the one entry marked current while the editor is open", () => {
    renderNav("/cvs/editor", navItemsFor(true, ALL_GENERAL));

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName("CVs");
    expect(current[0]).toHaveAttribute("href", "/cvs");
  });
});

describe("the Jobs entry behind the jobs feature (KODI-053, PRD 0013)", () => {
  const primaryLinks = () =>
    Array.from(renderedLinks()).map((link) => link.getAttribute("href"));

  it("shows 8 entries with Jobs and its Beta badge while jobs is in beta", () => {
    renderNav("/dashboard", navItemsFor(false, JOBS_BETA));

    expect(primaryLinks()).toEqual(hrefsOf(PRIMARY_NAV));
    const jobs = screen.getByRole("link", { name: "Jobs" });
    // Describes, never renames: the name stays exactly "Jobs".
    expect(jobs).toHaveAccessibleName("Jobs");
    expect(jobs).toHaveAccessibleDescription("Beta");
    expect(jobs).toHaveTextContent("Jobs Beta");
    expect(screen.getAllByText("Beta")).toHaveLength(1);
  });

  it("shows Jobs with no badge once jobs is released", () => {
    renderNav("/dashboard", navItemsFor(false, ALL_GENERAL));

    const jobs = screen.getByRole("link", { name: "Jobs" });
    expect(jobs).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(renderedLinks()).toHaveLength(8);
  });

  it("drops Jobs for a user without jobs: 7 entries", () => {
    renderNav("/dashboard", navItemsFor(false, CVS_GENERAL));

    expect(renderedLinks()).toHaveLength(7);
    expect(
      screen.queryByRole("link", { name: "Jobs" }),
    ).not.toBeInTheDocument();
    expect(primaryLinks()).toEqual(
      hrefsOf(PRIMARY_NAV).filter((href) => href !== "/jobs"),
    );
  });

  it("drops Jobs while the features are loading (the empty list)", () => {
    // `useMyFeatures` hands the layout `[]` until the first answer, so the
    // entry never flashes in for a user who does not have it.
    expect(hrefsOf(navItemsFor(false, NO_FEATURES))).not.toContain("/jobs");
    expect(hrefsOf(navItemsFor(true, NO_FEATURES))).not.toContain("/jobs");
  });

  it("ignores a feature key it does not gate on", () => {
    const unknown = [{ key: "other", stage: "beta" }] as unknown as MyFeature[];
    expect(hrefsOf(navItemsFor(false, unknown))).not.toContain("/jobs");
  });

  it("adds Admin last for an admin, with or without jobs", () => {
    const withJobs = navItemsFor(true, JOBS_BETA);
    expect(withJobs).toHaveLength(9);
    expect(withJobs.at(-1)).toBe(ADMIN_NAV);

    const withoutJobs = navItemsFor(true, CVS_GENERAL);
    expect(withoutJobs).toHaveLength(8);
    expect(withoutJobs.at(-1)).toBe(ADMIN_NAV);
  });

  it("keeps Admin's System description beside a Beta Jobs entry", () => {
    renderNav("/dashboard", navItemsFor(true, JOBS_BETA));

    expect(
      screen.getByRole("link", { name: "Admin" }),
    ).toHaveAccessibleDescription("System");
    expect(
      screen.getByRole("link", { name: "Jobs" }),
    ).toHaveAccessibleDescription("Beta");
  });

  it("points each mounted nav's Jobs entry at its own badge", () => {
    render(
      <>
        <SidebarNav items={navItemsFor(false, JOBS_BETA)} activePath="/jobs" />
        <SidebarNav items={navItemsFor(false, JOBS_BETA)} activePath="/jobs" />
      </>,
    );

    const links = screen.getAllByRole("link", { name: "Jobs" });
    const ids = links.map((link) => link.getAttribute("aria-describedby"));
    expect(ids[0]).not.toBe(ids[1]);
    for (const link of links) {
      expect(link).toHaveAccessibleDescription("Beta");
      expect(link).toHaveAttribute("aria-current", "page");
    }
  });

  it("never marks PRIMARY_NAV itself as beta", () => {
    navItemsFor(false, JOBS_BETA);
    expect(PRIMARY_NAV.some((item) => item.beta)).toBe(false);
  });
});

describe("the CVs entry behind the cvs feature (PRD 0015)", () => {
  const cvs = PRIMARY_NAV.find((item) => item.href === "/cvs")!;
  const primaryLinks = () =>
    Array.from(renderedLinks()).map((link) => link.getAttribute("href"));

  it("is gated on cvs", () => {
    expect(cvs.feature).toBe("cvs");
  });

  it("counts 6 entries with neither feature, 7 with one, 8 with both", () => {
    expect(navItemsFor(false, NO_FEATURES)).toHaveLength(6);
    expect(navItemsFor(false, JOBS_ONLY)).toHaveLength(7);
    expect(navItemsFor(false, CVS_GENERAL)).toHaveLength(7);
    expect(navItemsFor(false, ALL_GENERAL)).toHaveLength(8);
  });

  it("adds Admin on top of each count for an admin", () => {
    expect(navItemsFor(true, NO_FEATURES)).toHaveLength(7);
    expect(navItemsFor(true, JOBS_ONLY)).toHaveLength(8);
    expect(navItemsFor(true, ALL_GENERAL)).toHaveLength(9);
    expect(navItemsFor(true, ALL_GENERAL).at(-1)).toBe(ADMIN_NAV);
  });

  it("drops CVs for a user with jobs but without cvs", () => {
    renderNav("/dashboard", navItemsFor(false, JOBS_ONLY));

    expect(renderedLinks()).toHaveLength(7);
    expect(screen.queryByRole("link", { name: "CVs" })).not.toBeInTheDocument();
    expect(primaryLinks()).toEqual(
      hrefsOf(PRIMARY_NAV).filter((href) => href !== "/cvs"),
    );
  });

  it("renders the 6 ungated entries with neither feature", () => {
    renderNav("/dashboard", navItemsFor(false, NO_FEATURES));

    expect(primaryLinks()).toEqual([
      "/dashboard",
      "/applications",
      "/agenda",
      "/reports",
      "/cycles",
      "/profile",
    ]);
  });

  it("shows CVs with its Beta badge while cvs is in beta", () => {
    renderNav("/dashboard", navItemsFor(false, CVS_BETA));

    const link = screen.getByRole("link", { name: "CVs" });
    // Describes, never renames: the name stays exactly "CVs".
    expect(link).toHaveAccessibleName("CVs");
    expect(link).toHaveAccessibleDescription("Beta");
    expect(link).toHaveTextContent("CVs Beta");
    expect(screen.getAllByText("Beta")).toHaveLength(1);
  });

  it("shows a Beta badge on both Jobs and CVs while both are in beta", () => {
    renderNav("/dashboard", navItemsFor(false, BOTH_BETA));

    expect(
      screen.getByRole("link", { name: "Jobs" }),
    ).toHaveAccessibleDescription("Beta");
    expect(
      screen.getByRole("link", { name: "CVs" }),
    ).toHaveAccessibleDescription("Beta");
    expect(screen.getAllByText("Beta")).toHaveLength(2);
  });

  it("shows CVs with no badge once cvs is released", () => {
    renderNav("/dashboard", navItemsFor(false, CVS_GENERAL));

    const link = screen.getByRole("link", { name: "CVs" });
    expect(link).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("drops CVs while the features are loading (the empty list)", () => {
    expect(hrefsOf(navItemsFor(false, NO_FEATURES))).not.toContain("/cvs");
    expect(hrefsOf(navItemsFor(true, NO_FEATURES))).not.toContain("/cvs");
  });
});
