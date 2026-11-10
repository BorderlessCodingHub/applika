"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { ApplikaIcon } from "@/components/app-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The public phone header of v2/Landing and v3/Cli: the home link, then the
 * theme toggle and the language toggle with flags only. Sign in and Dashboard
 * live in the floating `PhoneLandingCta`.
 */
export function PhoneLandingHeader() {
  const tHeader = useTranslations("header");

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
      {/* Link 126 + 4 + theme 44 + 4 + flags 94 = 272: one row from 312px wide. */}
      <div className="ph-pair ml-auto flex items-center gap-1">
        <ThemeToggle />
        <LanguageToggle variant="default" flagsOnly />
      </div>
    </header>
  );
}
