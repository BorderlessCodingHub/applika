"use client";
import { APP_CONFIG } from "@/config";
import { ApplikaIcon } from "../app-logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60 py-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 md:px-8">
        <div className="flex items-center gap-2">
          <ApplikaIcon className="h-7 w-7" />
          <span className="font-display text-sm text-muted-foreground">
            {APP_CONFIG.name}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">Job Application Tracker</p>
      </div>
    </footer>
  );
}
