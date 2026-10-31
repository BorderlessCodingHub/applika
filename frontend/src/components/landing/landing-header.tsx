"use client";

import { useTranslations } from "next-intl";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AppLogo } from "../app-logo";
import { SignInLink } from "../auth-buttons";

export function LandingHeader() {
  const { isAuthenticated, isLoading } = useAuth();
  const t = useTranslations("landing");
  const tHeader = useTranslations("header");

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3.5 md:px-8">
        <Link
          href="/"
          aria-label={tHeader("home")}
          className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <AppLogo mode="header" />
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          {!isLoading && isAuthenticated ? (
            <Button
              asChild
              size="sm"
              className="gap-2 font-display font-medium"
            >
              <Link href="/dashboard">
                {t("dashboard")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="gap-2 font-display font-medium"
            >
              <SignInLink>{t("signIn")}</SignInLink>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
