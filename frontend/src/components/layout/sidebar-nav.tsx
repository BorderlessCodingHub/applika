"use client";

import Link from "next/link";
import { Fragment } from "react";
import { isNavItemActive, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

/**
 * Id of a group's label. The label is NOT `aria-hidden`: with the old amber
 * treatment gone, the group name is the only thing that marks an entry as
 * privileged, so hiding it would leave that signal sighted-users-only.
 */
const groupLabelId = (group: string) =>
  `sidebar-nav-group-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

interface SidebarNavProps {
  items: NavItem[];
  /** Current pathname. Never read from a router hook — both the desktop rail
   *  and the mobile sheet render this component. */
  activePath: string;
  /** Fired after any entry is clicked (the mobile sheet closes on it). */
  onNavigate?: () => void;
  className?: string;
}

export function SidebarNav({
  items,
  activePath,
  onNavigate,
  className,
}: SidebarNavProps) {
  return (
    <nav
      aria-label="Primary"
      className={cn("flex flex-col gap-0.5", className)}
    >
      {items.map((item, index) => {
        const active = isNavItemActive(item, activePath);
        const Icon = item.icon;
        const group = item.group;
        const startsGroup = group && group !== items[index - 1]?.group;

        return (
          <Fragment key={item.href}>
            {startsGroup ? (
              <div
                id={groupLabelId(group)}
                className="mt-3 mb-1 border-t border-sidebar-border px-2.5 pt-3 text-[10px] font-semibold tracking-wide-label text-sidebar-foreground/45 uppercase"
              >
                {group}
              </div>
            ) : null}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              // Describes, never names: the accessible name stays exactly the
              // label (`admin-gating.spec.ts` asserts "Admin" exactly), while
              // the group is announced after it.
              aria-describedby={group ? groupLabelId(group) : undefined}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active
                    ? "text-primary"
                    : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground",
                )}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
