import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneTab {
  href: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
}

export interface PhoneTabBarProps {
  /** The navigation landmark's name ("Primary"). */
  label: string;
  tabs: readonly PhoneTab[];
  className?: string;
}

export function PhoneTabBar({ label, tabs, className }: PhoneTabBarProps) {
  return (
    <nav
      data-slot="phone-tab-bar"
      aria-label={label}
      className={cn("ph-app ph-tabbar", className)}
    >
      {tabs.map(({ href, label: tabLabel, icon: Icon, current }) => (
        <Link
          key={href}
          href={href}
          aria-current={current ? "page" : undefined}
          className={cn("ph-tab", current && "ph-on")}
        >
          <Icon size={22} aria-hidden="true" />
          <span className="max-w-full truncate">{tabLabel}</span>
        </Link>
      ))}
    </nav>
  );
}
