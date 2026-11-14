"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { ApplikaIcon } from "@/components/app-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/contexts/auth-context";

/**
 * The public phone header of v2/Landing and v3/Cli, on one row: the Applika
 * icon as the home link at the left; at the right the theme toggle, the
 * language toggle with flags only, then Sign in to `/login`, or Dashboard to
 * `/dashboard` once signed in (the desktop `LandingHeader`'s words).
 */
export function PhoneLandingHeader() {
  const tHeader = useTranslations("header");
  const tLanding = useTranslations("landing");
  const { isAuthenticated, isLoading } = useAuth();
  const signedIn = !isLoading && isAuthenticated;

  return (
    <header className="ph-landing-header h-auto min-h-16 flex-wrap gap-y-1 py-[7px]">
      <Link
        href="/"
        aria-label={tHeader("home")}
        className="ph-landing-home text-foreground"
      >
        <ApplikaIcon size={30} aria-hidden="true" className="text-primary" />
      </Link>
      <div className="ph-landing-actions">
        <div className="ph-pair flex items-center">
          <ThemeToggle />
          <LanguageToggle variant="default" flagsOnly />
        </div>
        <Link
          href={signedIn ? "/dashboard" : "/login"}
          data-slot="landing-phone-sign-in"
          className="ph-btn ph-pri ph-sm shrink-0 whitespace-nowrap"
        >
          {signedIn ? tLanding("dashboard") : tLanding("signIn")}
        </Link>
      </div>
    </header>
  );
}
