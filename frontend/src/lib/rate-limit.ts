import { AxiosError } from "axios";

/**
 * A 429 is a TEMPORARY refusal, never a hard error: the caller (a query or a
 * mutation) is expected to wait `retryAfterMs(error)` and try again, keeping
 * whatever it already had on screen. This module is the single place that
 * reads the shape of that refusal — the axios status, the `retry-after`
 * header (KODI-039's API contract) and the `detail` text — so nothing else
 * has to know axios lowercases response headers or that FastAPI's `detail`
 * is sometimes not a plain string (KODI-039 always sends one for a 429, but
 * this still guards the shape the way `getBlobApiError` does for a blob).
 *
 * It lives outside `api-client.ts` for the same reason `blob-error.ts` does:
 * that module imports the service container and is therefore circular with
 * anything a service would need to import back.
 */

const DEFAULT_RETRY_AFTER_MS = 60_000;
const MIN_RETRY_AFTER_MS = 1_000;

export function isRateLimited(error: unknown): error is AxiosError {
  return error instanceof AxiosError && error.response?.status === 429;
}

/**
 * `Retry-After` (seconds) x 1000, clamped to at least one second and falling
 * back to 60s when the header is missing or not a number (R-019).
 */
export function retryAfterMs(error: unknown): number {
  if (!isRateLimited(error)) return DEFAULT_RETRY_AFTER_MS;

  const header = error.response?.headers?.["retry-after"];
  const seconds = typeof header === "string" ? parseInt(header, 10) : NaN;
  if (!Number.isFinite(seconds)) return DEFAULT_RETRY_AFTER_MS;

  return Math.max(seconds * 1000, MIN_RETRY_AFTER_MS);
}

/**
 * The 429's own `detail` ("Too many requests. Try again in <n> seconds."),
 * or `null` when it is not a 429 or the body carries no usable string — the
 * same non-empty-string guard `getBlobApiError` applies, so a toast never
 * renders `[object Object]` or "undefined".
 */
export function rateLimitNotice(error: unknown): string | null {
  if (!isRateLimited(error)) return null;

  const detail = (error.response?.data as { detail?: unknown } | undefined)
    ?.detail;
  return typeof detail === "string" && detail ? detail : null;
}
