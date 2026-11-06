/**
 * Return-to after sign-in (KODI-058). A signed-out visit to a page that must
 * come back after login — today only `/device`, so a CLI device code
 * survives the sign-in round trip — stores its path + query in
 * `sessionStorage` before the protected layout sends the browser to
 * `/login`. The sign-in page consumes it once on success, else the first
 * authenticated protected render does; a new account keeps it until it
 * answers the `/welcome` choice.
 */
export const RETURN_TO_KEY = "applika:return-to";

const RETURN_TO_PATHS = new Set(["/device"]);

/** The static export may serve a trailing slash. */
function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function remembersReturnTo(pathname: string): boolean {
  return RETURN_TO_PATHS.has(normalizePath(pathname));
}

/** Same-origin paths only: `/x`, never `//host` or `/\host`. */
export function isSafeReturnTo(value: string | null): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  );
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function storeReturnTo(target: string): void {
  if (!isSafeReturnTo(target)) return;
  try {
    storage()?.setItem(RETURN_TO_KEY, target);
  } catch {
    // Storage full or blocked: the user signs in and lands on the dashboard.
  }
}

/** Reads AND removes the stored target; `null` when absent or unsafe. */
export function consumeReturnTo(): string | null {
  const store = storage();
  if (!store) return null;
  let value: string | null = null;
  try {
    value = store.getItem(RETURN_TO_KEY);
    store.removeItem(RETURN_TO_KEY);
  } catch {
    return null;
  }
  return isSafeReturnTo(value) ? value : null;
}
