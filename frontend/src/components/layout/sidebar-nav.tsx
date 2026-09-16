"use client";

import Link from "next/link";
import { Fragment } from "react";
import { isNavItemActive, type NavItem } from "./nav";
import { cn } from "@/lib/utils";

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
        const startsGroup =
          item.group && item.group !== items[index - 1]?.group;

        return (
          <Fragment key={item.href}>
            {startsGroup ? (
              <div
                aria-hidden
                className="mt-3 mb-1 border-t border-sidebar-border px-2.5 pt-3 text-[10px] font-semibold tracking-wide-label text-sidebar-foreground/45 uppercase"
              >
                {item.group}
              </div>
            ) : null}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
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
