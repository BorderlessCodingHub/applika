import type { LucideIcon } from "lucide-react";

import { ADMIN_NAV, type NavItem } from "@/components/layout/nav";
import {
  ACCOUNT_WORKSPACE_ICONS,
  PHONE_TAB_ICONS,
} from "@/components/phone/phone-icons";
import { word } from "@/i18n/translator";

/**
 * The phone shell's map (ADR-0027, PRD 0021): which screens carry the bottom
 * tab bar, which carry a back bar and where it returns, and the Account hub's
 * rows. Every word is a getter over the message files (`word`), read at
 * render time; the component rendering it also calls `useTranslations`, so a
 * language switch re-renders it (the `nav.ts` precedent).
 */

/** `/jobs/` and `/jobs` are one screen; `/` stays `/`. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export interface PhoneTabRoot {
  href: keyof typeof PHONE_TAB_ICONS;
  readonly label: string;
  icon: LucideIcon;
}

function tab(href: keyof typeof PHONE_TAB_ICONS, key: string): PhoneTabRoot {
  return {
    href,
    icon: PHONE_TAB_ICONS[href],
    get label() {
      return word(key);
    },
  };
}

/** Today, Pipeline, Agenda, Insights: the four screens with the tab bar. */
export const TAB_ROOTS: readonly PhoneTabRoot[] = [
  tab("/dashboard", "phone.shell.today"),
  tab("/applications", "phone.shell.pipeline"),
  tab("/agenda", "nav.agenda"),
  tab("/insights", "phone.shell.insights"),
];

export function isTabRoot(pathname: string): boolean {
  const path = normalizePath(pathname);
  return TAB_ROOTS.some((root) => root.href === path);
}

/** The FAB ("Add"): the Today and Pipeline lists only. */
export const FAB_PATHS: readonly string[] = ["/dashboard", "/applications"];

export function hasFab(pathname: string): boolean {
  return FAB_PATHS.includes(normalizePath(pathname));
}

/**
 * Screens rendered from their own V2 board: they own the board's padding, so
 * the shell adds none around them. Every other route keeps today's content
 * and today's padding inside the phone layout. Grows as boards are ported.
 */
export const PHONE_SCREEN_PATHS: ReadonlySet<string> = new Set([
  "/dashboard",
  "/applications",
  "/agenda",
  "/account",
  "/insights",
  "/welcome",
  "/device",
  "/profile",
  "/cycles",
  "/reports",
  "/admin",
  "/jobs",
  "/jobs/view",
  "/cvs",
  "/cvs/editor",
  "/applications/new-with-cv",
]);

/**
 * Whole sub-trees that own their padding: every report day (`/reports/14`),
 * and every admin section, under the phone admin header (the sections
 * without a board keep today's content inside its 20px sides).
 */
export const PHONE_SCREEN_PREFIXES: readonly string[] = [
  "/reports/",
  "/admin/",
];

export function isPhoneScreen(pathname: string): boolean {
  const path = normalizePath(pathname);
  return (
    PHONE_SCREEN_PATHS.has(path) ||
    PHONE_SCREEN_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

export interface PhoneBack {
  href: string;
  /** The name of the screen it returns to. */
  readonly label: string;
}

function back(href: string, key: string): PhoneBack {
  return {
    href,
    get label() {
      return word(key);
    },
  };
}

/**
 * Screens with no V2 board: the parent the back bar returns to, named after
 * it. `/applications/cv` returns to the list the phone calls Pipeline.
 */
export const PHONE_PARENTS: Readonly<Record<string, PhoneBack>> = {
  "/cvs/new": back("/cvs", "nav.cvs"),
  "/applications/cv": back("/applications", "phone.shell.pipeline"),
  "/admin/supports": back("/admin", "nav.admin"),
  "/admin/discord-webhooks": back("/admin", "nav.admin"),
};

/** Back bars the boards draw (target and visible label). */
const BOARD_PARENTS: Readonly<Record<string, PhoneBack>> = {
  "/account": back("/dashboard", "phone.shell.back"),
  "/jobs/view": back("/jobs", "nav.jobs"),
  "/cvs/editor": back("/cvs", "nav.cvs"),
  "/applications/new-with-cv": back("/applications", "nav.applications"),
  "/admin/features/view": back("/admin/features", "admin.nav.features"),
};

/** Screens the Account hub opens: their boards return to it. */
const ACCOUNT_CHILDREN: readonly string[] = [
  "/jobs",
  "/cvs",
  "/cycles",
  "/reports",
  "/profile",
  "/device",
  "/admin",
];

/** The Welcome board draws no top bar: its two actions are its only exits. */
const NO_TOP_BAR: readonly string[] = ["/welcome"];

/**
 * The back bar for `pathname`, or `null` on a screen without one (the four
 * tab roots, which carry the tab bar, and Welcome).
 */
export function phoneBackFor(pathname: string): PhoneBack | null {
  const path = normalizePath(pathname);
  if (isTabRoot(path) || NO_TOP_BAR.includes(path)) return null;
  const known = BOARD_PARENTS[path] ?? PHONE_PARENTS[path];
  if (known) return known;
  if (path.startsWith("/reports/")) return back("/reports", "nav.reports");
  if (ACCOUNT_CHILDREN.includes(path) || path.startsWith("/admin/")) {
    return back("/account", "phone.shell.account");
  }
  // A protected address no map names yet: back to Today, the board's "Back".
  return back("/dashboard", "phone.shell.back");
}

export interface AccountHubRow {
  key:
    | "jobs"
    | "cvs"
    | "reports"
    | "cycles"
    | "profile"
    | "devices"
    | "device"
    | "admin";
  href: string;
  label: string;
  icon?: LucideIcon;
  beta?: boolean;
}

const WORKSPACE_ORDER = [
  ["jobs", "/jobs"],
  ["cvs", "/cvs"],
  ["reports", "/reports"],
  ["cycles", "/cycles"],
] as const;

/**
 * The Account hub's rows, from the `navItems` the shell received
 * (`navItemsFor` in the protected layout): a row shows only when its entry is
 * there, so the feature keys, the Reports badge and `is_admin` decide exactly
 * as they do for the desktop rail, and a feature taken away drops its row on
 * the next load. Devices & CLI and Sign in a device are open to every signed-in
 * user today (the profile's Devices tab, `/device`). Labels are read now: call
 * it during render.
 */
export function accountRows(navItems: readonly NavItem[]): {
  workspace: AccountHubRow[];
  account: AccountHubRow[];
} {
  const byHref = new Map(navItems.map((item) => [item.href, item]));

  const workspace: AccountHubRow[] = [];
  for (const [key, href] of WORKSPACE_ORDER) {
    const item = byHref.get(href);
    if (!item) continue;
    workspace.push({
      key,
      href,
      label: item.label,
      icon: ACCOUNT_WORKSPACE_ICONS[href],
      beta: item.beta === true,
    });
  }

  const account: AccountHubRow[] = [];
  const profile = byHref.get("/profile");
  if (profile) {
    account.push({ key: "profile", href: "/profile", label: profile.label });
  }
  account.push(
    {
      key: "devices",
      href: "/profile?tab=devices",
      label: word("phone.account.devices"),
    },
    { key: "device", href: "/device", label: word("device.title") },
  );
  const admin = byHref.get(ADMIN_NAV.href);
  if (admin) {
    account.push({ key: "admin", href: ADMIN_NAV.href, label: admin.label });
  }

  return { workspace, account };
}
