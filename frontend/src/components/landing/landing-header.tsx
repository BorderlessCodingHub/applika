"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { AUTH_LOGIN_URL } from "@/services/types/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AppLogo } from "../app-logo";
import { GithubIcon } from "../brand-icons";

export function LandingHeader() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3.5 md:px-8">
        <AppLogo mode="header" />

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {!isLoading && isAuthenticated ? (
            <Button
              asChild
              size="sm"
              className="gap-2 font-display font-medium"
            >
              <Link href="/dashboard">
                Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="gap-2 font-display font-medium"
            >
              <a href={AUTH_LOGIN_URL}>
                <GithubIcon className="h-4 w-4" />
                Sign in
              </a>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
