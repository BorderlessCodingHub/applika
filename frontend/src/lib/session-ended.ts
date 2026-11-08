import { AxiosError } from "axios";

import { apiErrorCode } from "@/lib/api-error-message";

/**
 * AUTH-1049 (ADR-0026): Borderless refused applika's grant, so the API ended
 * every web session of the user and this refresh cleared both cookies. The
 * sign-in page says so: `/login?error=AUTH-1049`.
 *
 * Two places see that refused refresh: `AuthProvider`'s own poll (its query
 * error) and the 401 interceptor in `api-client.ts` (a request answered 401,
 * then the refresh it tried). The interceptor records it here and
 * `AuthProvider` subscribes, so both end the session the same way. Any other
 * refused refresh keeps today's path: a plain `/login` (Plan correction 6).
 */
export const GRANT_ENDED_CODE = "AUTH-1049";

/** `AUTH-1049` when `error` is the 401 that ended the session that way, else `null`. */
export function grantEndedCode(error: unknown): typeof GRANT_ENDED_CODE | null {
  if (!(error instanceof AxiosError)) return null;
  if (error.response?.status !== 401) return null;
  return apiErrorCode(error.response.data) === GRANT_ENDED_CODE
    ? GRANT_ENDED_CODE
    : null;
}

/** Where a signed-out page goes: the sign-in page, with the refusal's words when there is one. */
export function signInPathFor(code: string | null | undefined): string {
  return code ? `/login?error=${encodeURIComponent(code)}` : "/login";
}

/** The interceptor's recorded refusal and when it happened (`Date.now()`). */
export interface RefusedRefresh {
  code: typeof GRANT_ENDED_CODE;
  at: number;
}

let ended: RefusedRefresh | null = null;
const listeners = new Set<() => void>();

/** Records a refused refresh; anything but AUTH-1049 is ignored. */
export function recordRefusedRefresh(error: unknown): void {
  const code = grantEndedCode(error);
  if (!code) return;
  ended = { code, at: Date.now() };
  listeners.forEach((listener) => listener());
}

/**
 * The recorded refusal, for `useSyncExternalStore` (the same object until the
 * next record). A full page load starts empty; `AuthProvider` ignores it once
 * a refresh succeeds after `at` (the user signed in again in another tab).
 */
export function refusedRefresh(): RefusedRefresh | null {
  return ended;
}

export function subscribeRefusedRefresh(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests only: forget the recorded refusal (between tests, nothing re-renders). */
export function resetRefusedRefresh(): void {
  ended = null;
}
