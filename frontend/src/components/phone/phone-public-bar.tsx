"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useTranslations } from "next-intl";

import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/** v2/CookiePolicy's `.top` below md, sticky as the board's fixed bar: "Home" and the pair. */
export function PhonePublicBar({ className }: { className?: string }) {
  const t = useTranslations("phone.shell");
  return (
    <header
      data-slot="phone-public-bar"
      className={cn("ph-app ph-top sticky top-0 z-30 md:hidden", className)}
    >
      <Link href="/" className="ph-back">
        <ChevronLeft size={24} aria-hidden="true" />
        {t("home")}
      </Link>
      <div className="ph-pair flex items-center gap-2">
        <ThemeToggle />
        <LanguageToggle variant="default" />
      </div>
    </header>
  );
}
