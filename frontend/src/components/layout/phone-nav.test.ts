import { describe, expect, it } from "vitest";

import { navItemsFor } from "./nav";
import {
  PHONE_PARENTS,
  accountRows,
  isPhoneScreen,
  normalizePath,
  phoneBackFor,
} from "./phone-nav";

/**
 * The back bar the map gives each screen (PRD 0021, PRD 0022): the admin
 * sections keep "Account" → /account, a feature's page returns to Features
 * (v3/AdminFeatureView's own back), an application's CV copy returns to
 * "Application" (v3/ApplicationCV), and the two admin redirects keep their
 * parents.
 */
const BACK_BARS: [path: string, back: [href: string, label: string] | null][] =
  [
    ["/dashboard", null],
    ["/applications", null],
    ["/agenda", null],
    ["/insights", null],
    ["/welcome", null],
    ["/account", ["/dashboard", "Back"]],
    ["/jobs", ["/account", "Account"]],
    ["/cvs", ["/account", "Account"]],
    ["/cycles", ["/account", "Account"]],
    ["/reports", ["/account", "Account"]],
    ["/profile", ["/account", "Account"]],
    ["/device", ["/account", "Account"]],
    ["/admin", ["/account", "Account"]],
    ["/admin/users", ["/account", "Account"]],
    ["/admin/companies", ["/account", "Account"]],
    ["/admin/platforms", ["/account", "Account"]],
    ["/admin/jobs", ["/account", "Account"]],
    ["/admin/features", ["/account", "Account"]],
    ["/admin/report-webhooks", ["/account", "Account"]],
    ["/admin/features/view", ["/admin/features", "Features"]],
    ["/admin/supports", ["/admin", "Admin"]],
    ["/admin/discord-webhooks", ["/admin", "Admin"]],
    ["/jobs/view", ["/jobs", "Jobs"]],
    ["/cvs/editor", ["/cvs", "CVs"]],
    ["/cvs/new", ["/cvs", "CVs"]],
    ["/applications/cv", ["/applications", "Application"]],
    ["/applications/new-with-cv", ["/applications", "Applications"]],
    ["/reports/14", ["/reports", "Reports"]],
    ["/somewhere/else", ["/dashboard", "Back"]],
  ];

describe("phoneBackFor", () => {
  it.each(BACK_BARS)("gives %s its back bar", (path, expected) => {
    const back = phoneBackFor(path);
    expect(back && [back.href, back.label]).toEqual(expected);
  });

  it("reads a closing slash as the same screen", () => {
    for (const path of ["/admin/users/", "/admin/companies/", "/jobs/"]) {
      const back = phoneBackFor(path);
      const same = phoneBackFor(normalizePath(path));
      expect(back && [back.href, back.label], path).toEqual(
        same && [same.href, same.label],
      );
    }
  });

  it("keeps today's parents for the two admin redirects, the only addresses without a board", () => {
    expect(
      Object.entries(PHONE_PARENTS).map(([path, back]) => [
        path,
        back.href,
        back.label,
      ]),
    ).toEqual([
      ["/admin/supports", "/admin", "Admin"],
      ["/admin/discord-webhooks", "/admin", "Admin"],
    ]);
  });

  it("draws the new master CV's back from its board: CVs", () => {
    expect(PHONE_PARENTS["/cvs/new"]).toBeUndefined();
    for (const path of ["/cvs/new", "/cvs/new/"]) {
      const back = phoneBackFor(path);
      expect(back && [back.href, back.label], path).toEqual(["/cvs", "CVs"]);
    }
  });

  it("draws an application's CV copy's back from its board: Application", () => {
    expect(PHONE_PARENTS["/applications/cv"]).toBeUndefined();
    for (const path of ["/applications/cv", "/applications/cv/"]) {
      const back = phoneBackFor(path);
      // The map's address; the screen points it at its row (`PhoneBackHref`).
      expect(back && [back.href, back.label], path).toEqual([
        "/applications",
        "Application",
      ]);
    }
  });

  it("draws a feature's back from its board, not from the no-board map", () => {
    expect(PHONE_PARENTS["/admin/features/view"]).toBeUndefined();
    for (const path of ["/admin/features/view", "/admin/features/view/"]) {
      const back = phoneBackFor(path);
      expect(back && [back.href, back.label], path).toEqual([
        "/admin/features",
        "Features",
      ]);
    }
  });
});

describe("isPhoneScreen", () => {
  it("lets the v3 admin sections own their padding, as every admin section does", () => {
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/companies",
      "/admin/platforms",
      "/admin/features",
      "/admin/features/view",
      "/admin/report-webhooks",
    ]) {
      expect(isPhoneScreen(path), path).toBe(true);
    }
  });

  it("lets the new master CV own its padding (v3/CVNew)", () => {
    for (const path of ["/cvs/new", "/cvs/new/"]) {
      expect(isPhoneScreen(path), path).toBe(true);
    }
  });

  it("lets an application's CV copy own its padding (v3/ApplicationCV)", () => {
    for (const path of ["/applications/cv", "/applications/cv/"]) {
      expect(isPhoneScreen(path), path).toBe(true);
    }
  });

  it("keeps today's padding on an address no map names", () => {
    expect(isPhoneScreen("/somewhere/new")).toBe(false);
  });

  it("never maps the public /mcp (nor /cli, its forward): its phone tree is the page's own, outside the shell", () => {
    expect(isPhoneScreen("/mcp")).toBe(false);
    expect(isPhoneScreen("/cli")).toBe(false);
  });
});

/**
 * PRD 0023: the Account hub opens Profile › MCP from its own row, between
 * Profile and Devices & CLI, for every user (no beta gate, ADR-0028); the
 * MCP section is `/profile`, so its back bar is the Account hub's.
 */
describe("accountRows: MCP", () => {
  it("puts MCP between Profile and Devices & CLI, for users and admins, with no feature", () => {
    for (const isAdmin of [false, true]) {
      const { account } = accountRows(
        navItemsFor(isAdmin, [], { hasReportsBadge: false }),
      );
      const keys = account.map((row) => row.key);
      expect(keys.slice(0, 3)).toEqual(["profile", "mcp", "devices"]);
      const mcp = account.find((row) => row.key === "mcp")!;
      expect([mcp.label, mcp.href, mcp.beta]).toEqual([
        "MCP",
        "/profile?tab=mcp",
        undefined,
      ]);
    }
  });

  it("returns from /profile?tab=mcp to the Account hub", () => {
    const back = phoneBackFor(normalizePath("/profile"));
    expect(back && [back.href, back.label]).toEqual(["/account", "Account"]);
  });
});
