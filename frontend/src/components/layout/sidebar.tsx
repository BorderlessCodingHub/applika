"use client";

import Link from "next/link";
import { Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { AppLogo } from "@/components/app-logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import type { NavItem } from "@/components/layout/nav";
import type { User } from "@/services/types/users";
import { cn } from "@/lib/utils";

interface SidebarProps {
  items: NavItem[];
  activePath: string;
  user: User | null;
  onLogout: () => void;
  onFeedback: () => void;
  /** Fired after any nav entry or menu item is chosen. */
  onNavigate?: () => void;
  /** Hide the brand row — the mobile sheet renders its own header bar. */
  hideBrand?: boolean;
  className?: string;
}

export function Sidebar({
  items,
  activePath,
  user,
  onLogout,
  onFeedback,
  onNavigate,
  hideBrand = false,
  className,
}: SidebarProps) {
  const t = useTranslations("header");
  const tNav = useTranslations("nav");
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-sidebar", className)}>
      {hideBrand ? null : (
        <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-4">
          <Link
            href="/dashboard"
            aria-label={t("home")}
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50"
          >
            <AppLogo mode="compact" />
          </Link>
        </div>
      )}

      {/* A plain scroll container, not a ScrollArea primitive: the rail holds
          at most eight entries and only overflows on very short viewports. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav
          items={items}
          activePath={activePath}
          onNavigate={onNavigate}
          className="p-2"
        />
      </div>

      {/* The public applika-cli page, outside the shell (landing layout). */}
      <div className="shrink-0 p-2">
        <Link
          href="/cli"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-primary transition-colors outline-none hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50"
        >
          <Terminal aria-hidden className="size-4 shrink-0 text-primary" />
          <span className="truncate">{tNav("cli")}</span>
        </Link>
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-2">
        <UserMenu
          user={user}
          onLogout={onLogout}
          onFeedback={onFeedback}
          onNavigate={onNavigate}
          variant="card"
        />
      </div>
    </div>
  );
}
