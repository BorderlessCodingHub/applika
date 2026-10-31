"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  FlaskConical,
  Globe,
  Search,
  Users,
  Webhook,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

const tabs: {
  href: string;
  label: AdminTab;
  icon: typeof Users;
  exact?: boolean;
}[] = [
  { href: "/admin", label: "dashboard", icon: BarChart3, exact: true },
  { href: "/admin/users", label: "users", icon: Users },
  { href: "/admin/companies", label: "companies", icon: Building2 },
  { href: "/admin/platforms", label: "platforms", icon: Globe },
  { href: "/admin/jobs", label: "jobs", icon: Search },
  { href: "/admin/features", label: "features", icon: FlaskConical },
  { href: "/admin/report-webhooks", label: "reportWebhooks", icon: Webhook },
];

type AdminTab =
  | "dashboard"
  | "users"
  | "companies"
  | "platforms"
  | "jobs"
  | "features"
  | "reportWebhooks";

export function AdminNav() {
  const pathname = usePathname();
  const t = useTranslations("admin.nav");

  return (
    <nav
      aria-label={t("label")}
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
            {t(tab.label)}
            {active && (
              <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-amber-400" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
