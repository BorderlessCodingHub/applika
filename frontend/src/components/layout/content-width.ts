"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useState,
} from "react";

/**
 * Which content gets the whole shell width instead of the reading column.
 * `AppShell` renders the container, so the opt-out lives here, in two forms:
 * by PATH ({@link FULL_WIDTH_PATHS}) for a route that is full width in every
 * state, and by CONTENT ({@link FullWidthContent}) for a route that is full
 * width only while one surface is on screen. Kept out of `nav.ts`: these are
 * not nav entries.
 */

/**
 * Full width in every state (KODI-008). `/applications/cv` left the list with
 * KODI-017 — "only full width when we have a cv copy to the application" — and
 * asks through {@link FullWidthContent} from its editor branch.
 */
export const FULL_WIDTH_PATHS = ["/cvs/new", "/cvs/editor"] as const;

/**
 * `true` when `path` is one of {@link FULL_WIDTH_PATHS}. Exact match; the
 * trailing slash the static export also serves is tolerated.
 */
export function isFullWidthPath(path: string): boolean {
  const normalised = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return FULL_WIDTH_PATHS.some((entry) => entry === normalised);
}

/** Withdraws one request. Safe to call twice. */
export type ReleaseFullWidth = () => void;

/** Asks the shell for the whole width until the returned release is called. */
export type RequestFullWidth = () => ReleaseFullWidth;

// `null` outside `AppShell`: the marker is a no-op in a page rendered alone.
const FullWidthRequestContext = createContext<RequestFullWidth | null>(null);

/** Provided once, by `AppShell`. */
export const FullWidthRequestProvider = FullWidthRequestContext.Provider;

/**
 * The shell's half. A COUNT, not a boolean: strict mode remounts every effect,
 * and one marker leaving must not release the width another still holds.
 */
export function useFullWidthRequests(): {
  requested: boolean;
  request: RequestFullWidth;
} {
  const [count, setCount] = useState(0);

  const request = useCallback<RequestFullWidth>(() => {
    setCount((current) => current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setCount((current) => current - 1);
    };
  }, []);

  return { requested: count > 0, request };
}

/**
 * Renders nothing; while mounted, the shell's container spends the whole width.
 * Render it in the SAME branch as the surface that wants the width, so the two
 * mount and unmount together.
 *
 * A layout effect so the shell re-renders before paint: the surface never shows
 * a frame in the column. Anything painted before it mounts — a Suspense
 * fallback, a loader — stays in the column, which is the rule.
 */
export function FullWidthContent(): null {
  const request = useContext(FullWidthRequestContext);
  useLayoutEffect(() => request?.(), [request]);
  return null;
}
