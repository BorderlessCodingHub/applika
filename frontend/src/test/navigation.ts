import { useMemo, useSyncExternalStore } from "react";
import { vi } from "vitest";

/**
 * A `next/navigation` stand-in for screens that write their query through
 * the History API (`?focus=`, the jobs filters): `useSearchParams` follows
 * `pushState`, `replaceState` and `popstate`, as Next keeps it in sync in the
 * app. Use it from a test's mock factory:
 *
 * ```ts
 * vi.mock("next/navigation", async () =>
 *   (await import("@/test/navigation")).navigationMock,
 * );
 * ```
 *
 * `pathname.current` is what `usePathname` answers; `routerPush` and
 * `routerReplace` record the router calls.
 */

const listeners = new Set<() => void>();
let tracking = false;

function notify() {
  for (const listener of [...listeners]) listener();
}

function track() {
  if (tracking) return;
  tracking = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = window.history[method].bind(window.history);
    window.history[method] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      notify();
    };
  }
  window.addEventListener("popstate", notify);
}

function subscribe(listener: () => void) {
  track();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const routerPush = vi.fn();
export const routerReplace = vi.fn();
export const pathname = { current: "/" };

export const navigationMock = {
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => pathname.current,
  useSearchParams: function useSearchParams() {
    const search = useSyncExternalStore(
      subscribe,
      () => window.location.search,
      () => "",
    );
    return useMemo(() => new URLSearchParams(search), [search]);
  },
};

/** Puts the address bar at `url` (same origin) without a navigation. */
export function setLocation(url: string) {
  track();
  window.history.replaceState(null, "", url);
}
