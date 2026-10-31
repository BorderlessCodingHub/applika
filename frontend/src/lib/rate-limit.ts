import { AxiosError } from "axios";

import { serverErrorMessage } from "@/lib/api-error-message";
import { translate } from "@/i18n/translator";

/**
 * A 429 (and, since KODI-058, a 503) is a TEMPORARY refusal, never a hard error: the caller (a query or a
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
/** A 503 is the session store being briefly unreachable (KODI-057 sends `Retry-After: 5`). */
const DEFAULT_UNAVAILABLE_RETRY_AFTER_MS = 5_000;
const MIN_RETRY_AFTER_MS = 1_000;

export function isRateLimited(error: unknown): error is AxiosError {
  return error instanceof AxiosError && error.response?.status === 429;
}

/**
 * A 503 is the API saying its session store (Redis) is unreachable
 * (KODI-057, ADR-0019 "fail closed"): the request was refused, NOT the
 * session. Like a 429 it is temporary and must never sign the web out.
 */
export function isServiceUnavailable(error: unknown): error is AxiosError {
  return error instanceof AxiosError && error.response?.status === 503;
}

/** 429 or 503: wait `retryAfterMs(error)` and try again, never sign out. */
export function isTemporary(error: unknown): error is AxiosError {
  return isRateLimited(error) || isServiceUnavailable(error);
}

/**
 * `Retry-After` (seconds) x 1000, clamped to at least one second, for a 429
 * or a 503. A missing or non-numeric header falls back to 60s for a 429
 * (R-019) and to 5s for a 503 (the server's own value).
 */
export function retryAfterMs(error: unknown): number {
  if (!isTemporary(error)) return DEFAULT_RETRY_AFTER_MS;
  const fallback = isServiceUnavailable(error)
    ? DEFAULT_UNAVAILABLE_RETRY_AFTER_MS
    : DEFAULT_RETRY_AFTER_MS;

  const header = error.response?.headers?.["retry-after"];
  const seconds = typeof header === "string" ? parseInt(header, 10) : NaN;
  if (!Number.isFinite(seconds)) return fallback;

  return Math.max(seconds * 1000, MIN_RETRY_AFTER_MS);
}

/**
 * The words for a 429, in the active language, or `null` when it is not a
 * 429. The chain: the body's code (GEN-1004 or AUTH-1009) with
 * `params.seconds`; else the API's own string `detail` (an API older than the
 * codes); else GEN-1004 built from the `Retry-After` header; else `null`, so
 * the caller shows its own line. A toast never renders `[object Object]` or
 * "undefined".
 */
export function rateLimitNotice(error: unknown): string | null {
  if (!isRateLimited(error)) return null;

  const message = serverErrorMessage(error.response?.data);
  if (message) return message;

  const header = error.response?.headers?.["retry-after"];
  const seconds = typeof header === "string" ? parseInt(header, 10) : NaN;
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return translate("errors.GEN-1004", { seconds });
}
