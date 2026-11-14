"use client";

import Link from "next/link";
import { Fragment, useId } from "react";
import { useTranslations } from "next-intl";
import { isNavItemActive, type NavItem } from "./nav";
import { BetaBadge } from "@/components/features/beta-badge";
import { cn } from "@/lib/utils";

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

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
  // Instance-scoped, NOT a pure function of the group name: below `md` the
  // desktop rail is `display:none` but still MOUNTED, so with the sheet open
  // two SidebarNavs render at once. A shared id would be duplicate HTML and
  // would point the sheet's `aria-describedby` at the hidden rail's copy.
  const uid = useId();
  // Subscribes: the entries' labels are getters over `nav.*`.
  const t = useTranslations("nav");
  /**
   * Id of a group's label. The label is NOT `aria-hidden`: with the old amber
   * treatment gone, the group name is the only thing that marks an entry as
   * privileged, so hiding it would leave that signal sighted-users-only.
   */
  const groupLabelId = (group: string) => `${uid}-group-${slugify(group)}`;
  /** Id of an entry's "Beta" badge: instance-scoped for the same reason. */
  const betaId = (href: string) => `${uid}-beta-${slugify(href)}`;

  return (
    <nav
      aria-label={t("primary")}
      className={cn("flex flex-col gap-0.5", className)}
    >
      {items.map((item, index) => {
        const active = isNavItemActive(item, activePath);
        const Icon = item.icon;
        const group = item.group;
        const beta = item.beta === true;
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
              // the group and the "Beta" badge are announced after it.
              aria-describedby={
                [group && groupLabelId(group), beta && betaId(item.href)]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
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
              {beta ? (
                <>
                  {" "}
                  <BetaBadge
                    id={betaId(item.href)}
                    size="sm"
                    aria-hidden
                    className="ml-auto"
                  />
                </>
              ) : null}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
