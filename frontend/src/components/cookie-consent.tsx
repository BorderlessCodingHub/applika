"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "applika.cookie-notice-ack";
const STORAGE_EVENT = "applika:cookie-notice-ack";

/**
 * The custom property `globals.css` reserves space with. `body` pads by it and
 * `h-viewport`/`min-h-viewport` subtract it, so the bar can never paint over
 * page content — including an in-page `sticky bottom-0` footer.
 */
export const COOKIE_NOTICE_HEIGHT_VAR = "--cookie-notice-height";

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

/**
 * Publishes the bar's measured height to the document while it is mounted, and
 * removes it on unmount. Measured rather than hardcoded: the copy wraps to
 * three lines at 320px, and a stale constant would silently under-reserve.
 */
function useReservedHeight(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const bar = ref.current;
    const root = document.documentElement;
    if (!bar) return;

    const measure = () => {
      const height = Math.ceil(bar.getBoundingClientRect().height);
      root.style.setProperty(COOKIE_NOTICE_HEIGHT_VAR, `${height}px`);
    };

    measure();
    // jsdom has no ResizeObserver: one measurement is still better than none.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(bar);

    return () => {
      observer?.disconnect();
      root.style.removeProperty(COOKIE_NOTICE_HEIGHT_VAR);
    };
  }, [ref]);
}

function CookieConsentBar({ onDismiss }: { onDismiss: () => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("cookies.notice");
  useReservedHeight(barRef);

  return (
    <div
      ref={barRef}
      role="dialog"
      aria-live="polite"
      aria-label={t("label")}
      className={cn(
        // z-40 is the page-chrome layer. It MUST stay below the z-50 Radix
        // portal layer or this bar floats over the open mobile nav sheet.
        "fixed inset-x-0 bottom-0 z-40",
        "border-t border-border/60 bg-surface-elevated/95 text-foreground shadow-elevated backdrop-blur",
        "animate-fade-in-up",
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 md:px-8">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Cookie className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="font-display text-sm leading-none font-semibold tracking-tight-display">
              {t("title")}
            </p>
            <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
              {t.rich("body", {
                link: (chunks) => (
                  <Link
                    href="/cookie-policy"
                    className="font-medium text-primary underline underline-offset-2 hover:text-foreground"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button size="sm" onClick={onDismiss}>
            {t("gotIt")}
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t("dismiss")}
            className={cn(
              "shrink-0 rounded-md p-1 text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden",
            )}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The cookie notice: a full-width bar pinned to the bottom of the viewport that
 * RESERVES its own height instead of floating over the page. It used to be a
 * bottom-right card, which covered the in-page sticky submit footer of the CV
 * editor and swallowed the click.
 */
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

  return <CookieConsentBar onDismiss={dismiss} />;
}
