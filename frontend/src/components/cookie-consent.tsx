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
  const acknowledged = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
        "fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))]",
        "rounded-lg border border-border bg-background text-foreground shadow-lg",
        "p-4",
      )}
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="flex-1 space-y-2">
          <p className="text-sm font-semibold leading-none">We use essential cookies</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Applika.dev only uses cookies that are strictly necessary to keep you signed in and to
            protect your session. No analytics, advertising, or tracking cookies are used.{" "}
            <Link
              href="/cookie-policy"
              className="underline underline-offset-2 hover:text-foreground"
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
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
