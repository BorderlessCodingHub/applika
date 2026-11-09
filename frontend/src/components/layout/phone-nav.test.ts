import { describe, expect, it } from "vitest";

import {
  PHONE_PARENTS,
  isPhoneScreen,
  normalizePath,
  phoneBackFor,
} from "./phone-nav";

/**
 * The back bar the map gives each screen today (PRD 0021), pinned before the
 * v3 screens land: the admin sections the v3 boards draw (Users, Companies,
 * Platforms) keep "Account" → /account, and the screens still without a
 * board keep their parents.
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
    ["/applications/cv", ["/applications", "Pipeline"]],
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

  it("keeps today's parents for the screens without a board", () => {
    expect(
      Object.entries(PHONE_PARENTS).map(([path, back]) => [
        path,
        back.href,
        back.label,
      ]),
    ).toEqual([
      ["/cvs/new", "/cvs", "CVs"],
      ["/applications/cv", "/applications", "Pipeline"],
      ["/admin/features/view", "/admin/features", "Features"],
      ["/admin/supports", "/admin", "Admin"],
      ["/admin/discord-webhooks", "/admin", "Admin"],
    ]);
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

  it("keeps today's padding on the screens whose boards land later", () => {
    for (const path of ["/cvs/new", "/applications/cv", "/cli"]) {
      expect(isPhoneScreen(path), path).toBe(false);
    }
  });
});
