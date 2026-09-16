"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { CliPromoBanner } from "@/components/cli-promo-banner";
import { FeedbackDialog } from "@/components/applications/feedback-dialog";
import { CycleSelector } from "@/components/layout/cycle-selector";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { PRIMARY_NAV, type NavItem } from "@/components/layout/nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import type { User } from "@/services/types/users";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
  /** Current pathname, from `usePathname()` in the consuming layout. */
  activePath: string;
  /** Nav entries, already filtered for the acting user (see `navItemsFor`). */
  navItems?: NavItem[];
  user: User | null;
  onLogout: () => void;
  /** Page-level actions rendered at the right of the header. */
  headerActions?: ReactNode;
  className?: string;
}

export function AppShell({
  children,
  activePath,
  navItems = PRIMARY_NAV,
  user,
  onLogout,
  headerActions,
  className,
}: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null);

  const closeMobileNav = () => setMobileNavOpen(false);

  // The sheet is `md:hidden`; without this a resize past `md` while it is open
  // leaves Radix trapping focus and locking body scroll inside an invisible panel.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const md = window.matchMedia("(min-width: 48rem)");
    const close = () => {
      if (md.matches) setMobileNavOpen(false);
    };
    close();
    md.addEventListener("change", close);
    return () => md.removeEventListener("change", close);
  }, [mobileNavOpen]);

  const sidebarProps = {
    items: navItems,
    activePath,
    user,
    onLogout,
    onFeedback: () => setFeedbackOpen(true),
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 border-r border-sidebar-border md:block">
        <Sidebar {...sidebarProps} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          size="nav"
          hideClose
          className="md:hidden"
          onCloseAutoFocus={(event) => {
            // Radix hands focus back to its own `Dialog.Trigger`. This sheet is
            // controlled and has no trigger inside the Root, so Radix's handler
            // focuses `null` and a keyboard user is dumped on <body>, losing
            // their place. Restore it to the button that opened the sheet.
            event.preventDefault();
            mobileNavTriggerRef.current?.focus();
          }}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Primary navigation, cycle selector and account menu.
          </SheetDescription>

          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-4">
            <Link
              href="/dashboard"
              aria-label="Applika.dev home"
              onClick={closeMobileNav}
              className="min-w-0 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50"
            >
              <AppLogo mode="compact" />
            </Link>
            <SheetClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close navigation menu"
                className="shrink-0"
              >
                <X className="size-4" />
              </Button>
            </SheetClose>
          </div>

          <Sidebar
            {...sidebarProps}
            hideBrand
            onNavigate={closeMobileNav}
            className="min-h-0 flex-1"
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          onLogout={onLogout}
          onFeedback={() => setFeedbackOpen(true)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          mobileNavTriggerRef={mobileNavTriggerRef}
          leading={<CycleSelector />}
          actions={headerActions}
        />

        <main className={cn("flex-1 overflow-y-auto", className)}>
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <CliPromoBanner />
            {children}
          </div>
        </main>
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}
