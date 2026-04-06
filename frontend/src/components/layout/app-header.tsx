"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, User, MessageSquareHeart, Menu } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { CycleSelector } from "@/components/layout/cycle-selector";
import { FeedbackDialog } from "@/components/applications/feedback-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserProfileAvatar } from "../profile/sub-components";

function UserMenu() {
  const { user, logout } = useAuth();
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full outline-none ring-offset-background transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <UserProfileAvatar className="h-8 w-8 text-xl cursor-pointer" user={user} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-medium">{user.username}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.email}
            </p>
          </div>
          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/profile" className="cursor-pointer gap-2">
              <User className="h-4 w-4" />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setFeedbackOpen(true)}
            className="cursor-pointer gap-2"
          >
            <MessageSquareHeart className="h-4 w-4" />
            Feedback
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={logout}
            className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}

export function AppHeader() {
  return (
    <header className="hidden h-14 shrink-0 items-center justify-end gap-5 border-b border-border/60 bg-card/80 px-6 backdrop-blur-xl md:flex">
      <CycleSelector />
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}

export function MobileHeader({
  onMenuToggle,
  mobileOpen,
}: {
  onMenuToggle: () => void;
  mobileOpen: boolean;
}) {
  return (
    <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-end gap-5 border-b border-border/60 bg-card/80 px-4 backdrop-blur-xl md:hidden">
      <CycleSelector className="max-w-full" />

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserMenu />
        <button
          onClick={onMenuToggle}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
