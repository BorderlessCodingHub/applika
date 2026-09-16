"use client";

import type { ReactNode, Ref } from "react";
import { Menu } from "lucide-react";
import { AppLogo } from "@/components/app-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { AgendaDropdown } from "@/components/layout/agenda-dropdown";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import type { User } from "@/services/types/users";
import { cn } from "@/lib/utils";

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  onFeedback: () => void;
  /** Opens the mobile navigation sheet. Rendered below md only. */
  onOpenMobileNav: () => void;
  /**
   * Ref to the menu trigger. The shell needs it to hand focus back when the
   * navigation sheet closes — see `onCloseAutoFocus` in `app-shell.tsx`.
   */
  mobileNavTriggerRef?: Ref<HTMLButtonElement>;
  /** Cycle selector slot. Inline on md+, wraps to its own row below md. */
  leading?: ReactNode;
  /** Page-level actions, right aligned. */
  actions?: ReactNode;
  className?: string;
}

export function Header({
  user,
  onLogout,
  onFeedback,
  onOpenMobileNav,
  mobileNavTriggerRef,
  leading,
  actions,
  className,
}: HeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur-xl md:h-14 md:flex-nowrap md:px-6 md:py-0",
        className,
      )}
    >
      <Button
        ref={mobileNavTriggerRef}
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open navigation menu"
        onClick={onOpenMobileNav}
        className="md:hidden"
      >
        <Menu className="size-5" />
      </Button>

      <div className="md:hidden">
        <AppLogo mode="compact" />
      </div>

      {leading ? (
        <div className="order-last flex min-w-0 basis-full items-center md:order-none md:w-64 md:basis-auto">
          {leading}
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5 md:gap-2">
        {actions}
        <AgendaDropdown />
        <ThemeToggle />
        <div className="md:hidden">
          <UserMenu
            user={user}
            onLogout={onLogout}
            onFeedback={onFeedback}
            variant="avatar"
          />
        </div>
      </div>
    </header>
  );
}
