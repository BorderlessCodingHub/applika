"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { ApplikaIcon } from "@/components/app-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/contexts/auth-context";

/**
 * The public phone header of v2/Landing and v3/Cli: the home link, the
 * language + theme pair (the boards draw only the logo and Sign in; the pair
 * stays, mobile-design rule 5) and Sign in, or Dashboard when signed in.
 */
export function PhoneLandingHeader() {
  const tLanding = useTranslations("landing");
  const tHeader = useTranslations("header");
  const { isAuthenticated, isLoading } = useAuth();
  const signedIn = !isLoading && isAuthenticated;

  return (
    <header className="ph-landing-header h-auto min-h-16 flex-wrap gap-x-1 gap-y-1 py-[7px]">
      <Link
        href="/"
        aria-label={tHeader("home")}
        className="flex min-h-11 items-center gap-1.5 text-foreground"
      >
        <ApplikaIcon size={30} aria-hidden="true" className="text-primary" />
        <span className="text-[16px] font-bold tracking-[-0.01em]">
          <span>applika</span>
          <span>.dev</span>
        </span>
      </Link>
      {/* 44px boxes abut, no gap: one row from 387px wide, else this group wraps right. */}
      <div className="ml-auto flex items-center">
        <div className="ph-pair flex items-center">
          <LanguageToggle variant="default" />
          <ThemeToggle />
        </div>
        <Link
          href={signedIn ? "/dashboard" : "/login"}
          className="flex min-h-11 items-center text-[15px] font-semibold"
        >
          {signedIn ? tLanding("dashboard") : tLanding("signIn")}
        </Link>
      </div>
    </header>
  );
}
