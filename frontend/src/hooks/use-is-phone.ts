"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

/**
 * Below md (48rem, 768px): the phone layout (ADR-0027). `47.99rem` and not
 * `max-width: 48rem`, so 768px itself is desktop, exactly where Tailwind's
 * `md:` starts. md stays the only breakpoint.
 */
export const PHONE_QUERY = "(max-width: 47.99rem)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

// The static export prerenders the desktop tree; the client takes over at
// once. Protected pages render only after auth resolves, so nothing flashes.
function getServerSnapshot(): boolean {
  return false;
}

/**
 * `true` while the viewport is narrower than md. It reads the width only:
 * never the user agent, never the account (ADR-0027). Follows a rotation or
 * a resize across md.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * A phone-only address (`/insights`, `/account`): at md and up the page goes
 * to `target` with `router.replace`. Read from `matchMedia` in an effect,
 * never from the server snapshot, and again whenever the width crosses md
 * while the page is open.
 */
export function useLeaveAtDesktop(target: string): void {
  const router = useRouter();
  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    const leave = () => {
      if (!phone.matches) router.replace(target);
    };
    leave();
    phone.addEventListener("change", leave);
    return () => phone.removeEventListener("change", leave);
  }, [router, target]);
}
