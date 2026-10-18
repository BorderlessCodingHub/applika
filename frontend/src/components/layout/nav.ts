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
}

export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/jobs", label: "Jobs", icon: Search, feature: "jobs" },
  { href: "/cvs", label: "CVs", icon: FileText, feature: "cvs" },
  { href: "/agenda", label: "Agenda", icon: CalendarClock },
  { href: "/reports", label: "Reports", icon: NotepadText },
  { href: "/cycles", label: "Cycles", icon: History },
  { href: "/profile", label: "Profile", icon: User },
];

// Kept out of PRIMARY_NAV so a non-admin render can never leak it: the
// (protected) layout appends it only when the acting user's is_admin is true.
export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  icon: Shield,
  group: "System",
};

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The entries the caller sees: a gated entry only with its feature (absent
 * while the features are still loading, so it never flashes in), marked
 * `beta` while that feature is in beta; `/admin` only for an admin.
 */
export function navItemsFor(
  isAdmin: boolean | undefined,
  features: readonly MyFeature[],
): NavItem[] {
  const items: NavItem[] = [];
  for (const item of PRIMARY_NAV) {
    if (!item.feature) {
      items.push(item);
      continue;
    }
    const feature = features.find((f) => f.key === item.feature);
    if (feature) items.push({ ...item, beta: feature.stage === "beta" });
  }
  if (isAdmin) items.push(ADMIN_NAV);
  return items;
}
