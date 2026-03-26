"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  User,
  LogOut,
  Menu,
  X,
  Shield,
  NotepadText,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { FeedbackButton } from "@/components/applications/feedback-dialog";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { AppLogo } from "../app-logo";
import { Button } from "../ui/button";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/applications", icon: Briefcase, label: "Applications" },
  { to: "/reports", icon: NotepadText, label: "Reports" },
  { to: "/profile", icon: User, label: "Profile" },
  { to: "/admin", icon: Shield, label: "Admin", adminOnly: true },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await api.get("/auth/logout");
    } finally {
      queryClient.clear();
      window.location.href = "/";
    }
  };

  const SidebarContent = () => (
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
      <div className="space-y-2 px-3">
        {user && (
          <div className="rounded-lg border border-border/60 bg-accent/50 px-3 py-2.5">
            <p className="truncate font-display text-sm font-medium text-foreground">
              {user.username}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {user.email}
            </p>
          </div>
        )}
        <FeedbackButton />
        <div className="flex items-center justify-between">
          <Button onClick={handleLogout} variant="ghost">
            <LogOut className="h-4 w-4" />
            <span className="font-display">Logout</span>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/60 bg-card md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile header */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-card/80 px-4 backdrop-blur-xl md:hidden">
        <Link href="/" className="flex items-center">
          <AppLogo mode="mobile" />
        </Link>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

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
              <SidebarContent />
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
  );
}
