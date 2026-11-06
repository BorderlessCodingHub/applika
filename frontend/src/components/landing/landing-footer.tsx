"use client";

import { useTranslations } from "next-intl";
import { APP_CONFIG } from "@/config";
import { ApplikaIcon } from "../app-logo";

export function LandingFooter() {
  const t = useTranslations("landing");
  return (
    <footer className="border-t border-border/60 py-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 md:px-8">
        <div className="flex shrink-0 items-center gap-2">
          <ApplikaIcon className="h-7 w-7" />
          <span className="font-display text-sm text-muted-foreground">
            {APP_CONFIG.name}
          </span>
        </div>
        <p className="text-right text-sm text-muted-foreground">
          {t("tagline")}
        </p>
      </div>
    </footer>
  );
}
