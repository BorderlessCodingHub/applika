"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Shield,
  NotepadText,
  History,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { AppLogo } from "../app-logo";
import { AppHeader, MobileHeader } from "./app-header";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/applications", icon: Briefcase, label: "Applications" },
  { to: "/reports", icon: NotepadText, label: "Reports" },
  { to: "/cycles", icon: History, label: "Cycles" },
  { to: "/admin", icon: Shield, label: "Admin", adminOnly: true },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

function SidebarContent({
  setMobileOpen,
}: {
  setMobileOpen: (value: boolean) => void;
}) {
  const { user } = useAuth();
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col justify-between py-6">
      <div>
        <Link href="/" className="mb-6 flex items-center px-4">
          <AppLogo mode="sidebar" />
        </Link>
        <nav className="space-y-0.5 px-3">
          {navItems
            .filter((item) => !item.adminOnly || user?.is_admin)
            .map((item) => {
              const isActive =
                pathname === item.to ||
                (item.to !== "/dashboard" && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? item.adminOnly
                        ? "bg-amber-500/15 text-amber-500 shadow-sm dark:shadow-[0_0_24px_-4px_rgba(251,191,36,0.25)]"
                        : "glow-primary bg-primary text-primary-foreground shadow-sm"
                      : item.adminOnly
                        ? "text-amber-500/60 hover:bg-amber-500/10 hover:text-amber-500"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="font-display">{item.label}</span>
                </Link>
              );
            })}
        </nav>
      </div>
    </div>
  );
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-card md:flex">
        <SidebarContent setMobileOpen={setMobileOpen} />
      </aside>

      {/* Right side: header + content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Desktop header */}
        <AppHeader />

        {/* Mobile header */}
        <MobileHeader
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          mobileOpen={mobileOpen}
        />

        {/* Mobile sidebar overlay */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden"
                onClick={() => setMobileOpen(false)}
              />
              <motion.aside
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
                className="fixed bottom-0 left-0 top-0 z-50 w-full max-w-80 border-r border-border/60 bg-card md:hidden"
              >
                <SidebarContent setMobileOpen={setMobileOpen} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content */}
        <main className="flex-1 overflow-auto pt-14 md:pt-0">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
