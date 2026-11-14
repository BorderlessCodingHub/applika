import {
  Briefcase,
  CalendarClock,
  FileText,
  History,
  LayoutDashboard,
  NotepadText,
  Search,
  Shield,
  User,
  type LucideIcon,
} from "lucide-react";

import { word } from "@/i18n/translator";
import type { FeatureKey, MyFeature } from "@/services/types/features";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Active only on an exact pathname match; otherwise the prefix matches. */
  exact?: boolean;
  /** Renders under a labelled divider. Consecutive items share one group. */
  group?: string;
  /**
   * A gated feature (PRD 0013): the entry renders only when the caller has
   * this key, and carries the "Beta" badge while its stage is `beta`.
   */
  feature?: FeatureKey;
  /** Set by `navItemsFor` from the caller's features; never authored here. */
  beta?: boolean;
  /**
   * Shown only to a caller with a recorded Borderless BASE or PSP badge,
   * held or waiting for confirmation (ADR-0024).
   */
  needsReportsBadge?: boolean;
}

/**
 * A nav entry whose `label` (and `group`) are getters over `nav.*`: each read
 * returns the words of the active language. `SidebarNav` subscribes with
 * `useTranslations`, so a switch re-renders the entries.
 */
function entry(
  key: string,
  item: Omit<NavItem, "label" | "group">,
  groupKey?: string,
): NavItem {
  const result = { ...item } as NavItem;
  Object.defineProperty(result, "label", {
    enumerable: true,
    get: () => word(`nav.${key}`),
  });
  if (groupKey) {
    Object.defineProperty(result, "group", {
      enumerable: true,
      get: () => word(`nav.${groupKey}`),
    });
  }
  return result;
}

export const PRIMARY_NAV: NavItem[] = [
  entry("dashboard", {
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  }),
  entry("applications", { href: "/applications", icon: Briefcase }),
  entry("jobs", { href: "/jobs", icon: Search, feature: "jobs" }),
  entry("cvs", { href: "/cvs", icon: FileText, feature: "cvs" }),
  entry("agenda", { href: "/agenda", icon: CalendarClock }),
  entry("reports", {
    href: "/reports",
    icon: NotepadText,
    needsReportsBadge: true,
  }),
  entry("cycles", { href: "/cycles", icon: History }),
  entry("profile", { href: "/profile", icon: User }),
];

// Kept out of PRIMARY_NAV so a non-admin render can never leak it: the
// (protected) layout appends it only when the acting user's is_admin is true.
export const ADMIN_NAV: NavItem = entry(
  "admin",
  { href: "/admin", icon: Shield },
  "system",
);

/**
 * A copy of `item` carrying `beta`. Copies the property descriptors, not the
 * values, so the label getters keep following the active language.
 */
function withBeta(item: NavItem, beta: boolean): NavItem {
  const copy = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(item),
  ) as NavItem;
  copy.beta = beta;
  return copy;
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export interface NavAccess {
  /** A recorded BASE or PSP badge, held or not (`badges.length > 0`). */
  hasReportsBadge?: boolean;
}

/**
 * The entries the caller sees: a gated entry only with its feature (absent
 * while the features are still loading, so it never flashes in), marked
 * `beta` while that feature is in beta; Reports only with a recorded
 * membership badge, administrators included; `/admin` only for an admin.
 */
export function navItemsFor(
  isAdmin: boolean | undefined,
  features: readonly MyFeature[],
  access: NavAccess = {},
): NavItem[] {
  const items: NavItem[] = [];
  for (const item of PRIMARY_NAV) {
    if (item.needsReportsBadge && !access.hasReportsBadge) continue;
    if (!item.feature) {
      items.push(item);
      continue;
    }
    const feature = features.find((f) => f.key === item.feature);
    if (feature) items.push(withBeta(item, feature.stage === "beta"));
  }
  if (isAdmin) items.push(ADMIN_NAV);
  return items;
}
