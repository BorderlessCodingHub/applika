"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, Globe, Users, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Dashboard", icon: BarChart3, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/companies", label: "Companies", icon: Building2 },
  { href: "/admin/platforms", label: "Platforms", icon: Globe },
  { href: "/admin/discord-webhooks", label: "Discord", icon: Webhook },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="mb-5 flex items-center gap-1 overflow-x-auto border-b border-border/40 pb-px"
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon aria-hidden className="h-4 w-4" />
            {tab.label}
            {active && (
              <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-amber-400" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
