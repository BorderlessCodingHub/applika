import {
  Briefcase,
  CalendarClock,
  History,
  LayoutDashboard,
  NotepadText,
  Shield,
  User,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Active only on an exact pathname match; otherwise the prefix matches. */
  exact?: boolean;
  /** Renders under a labelled divider. Consecutive items share one group. */
  group?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  { href: "/applications", label: "Applications", icon: Briefcase },
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

export function navItemsFor(isAdmin: boolean | undefined): NavItem[] {
  return isAdmin ? [...PRIMARY_NAV, ADMIN_NAV] : PRIMARY_NAV;
}
