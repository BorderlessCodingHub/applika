"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut, MessageSquareHeart, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserProfileAvatar } from "@/components/profile/sub-components";
import type { User as AppUser } from "@/services/types/users";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  user: AppUser | null;
  onLogout: () => void;
  /** Opens the shell-owned FeedbackDialog. */
  onFeedback: () => void;
  /** Fired after any item is chosen (the mobile sheet closes on it). */
  onNavigate?: () => void;
  /** "card" = sidebar footer (name + email); "avatar" = compact header trigger. */
  variant?: "card" | "avatar";
  className?: string;
}

export function UserMenu({
  user,
  onLogout,
  onFeedback,
  onNavigate,
  variant = "card",
  className,
}: UserMenuProps) {
  if (!user) return null;

  const card = variant === "card";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        className={cn(
          "flex items-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          card
            ? "w-full gap-2.5 p-2 text-left transition-colors hover:bg-sidebar-accent/60"
            : "rounded-full transition-opacity hover:opacity-80",
          className,
        )}
      >
        <UserProfileAvatar
          user={user}
          className={cn(
            "shrink-0 shadow-none",
            card
              ? "size-7 text-[11px] ring-1 ring-sidebar-border"
              : "size-8 text-sm ring-1 ring-border",
          )}
        />

        {card ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-sidebar-foreground">
                {user.username}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {user.email}
              </span>
            </span>
            <ChevronsUpDown
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={card ? "start" : "end"}
        side={card ? "top" : "bottom"}
        sideOffset={6}
        className="w-56"
      >
        <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium" title={user.username}>
            {user.username}
          </span>
          <span
            className="truncate text-xs font-normal text-muted-foreground"
            title={user.email}
          >
            {user.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild onSelect={onNavigate}>
          <Link href="/profile" className="cursor-pointer gap-2">
            <User className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onSelect={() => {
            onNavigate?.();
            onFeedback();
          }}
        >
          <MessageSquareHeart className="size-4" />
          Feedback
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          className="cursor-pointer gap-2"
          onSelect={onLogout}
        >
          <LogOut className="size-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
