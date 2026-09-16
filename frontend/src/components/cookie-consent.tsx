"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "applika.cookie-notice-ack";
const STORAGE_EVENT = "applika:cookie-notice-ack";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

// Hide during SSR / static export to avoid hydration mismatch — the
// client immediately re-reads localStorage on mount.
const getServerSnapshot = (): boolean => true;

export function CookieConsent() {
  const acknowledged = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [closedThisSession, setClosedThisSession] = useState(false);

  if (acknowledged || closedThisSession) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
      window.dispatchEvent(new Event(STORAGE_EVENT));
    } catch {
      // localStorage unavailable (private mode, disabled) — fall back to in-memory dismissal
      setClosedThisSession(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      className={cn(
        // z-40 is the page-chrome layer. It MUST stay below the z-50 Radix
        // portal layer or this card floats over the open mobile nav sheet.
        "fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))]",
        "rounded-xl border border-border/60 bg-surface-elevated text-foreground shadow-elevated",
        "animate-fade-in-up p-4",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Cookie className="size-4" aria-hidden />
        </span>
        <div className="flex-1 space-y-2">
          <p className="font-display text-sm leading-none font-semibold tracking-tight-display">
            We use essential cookies
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Applika.dev only uses cookies that are strictly necessary to keep
            you signed in and to protect your session. No analytics,
            advertising, or tracking cookies are used.{" "}
            <Link
              href="/cookie-policy"
              className="font-medium text-primary underline underline-offset-2 hover:text-foreground"
            >
              Learn more
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss cookie notice"
          className={cn(
            "shrink-0 rounded-md p-1 text-muted-foreground transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden",
          )}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </div>
  );
}
