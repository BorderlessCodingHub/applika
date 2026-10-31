import {
  hasMessage,
  translate,
  type TranslationValues,
} from "@/i18n/translator";

/**
 * The one place the web turns an API error body into words (ADR-0025):
 * 1. a `code` the web knows → `errors.<code>` in the active language, its
 *    `params` filled into the sentence (GEN-1003, a validation 422, is one
 *    line; its `detail` array is never shown);
 * 2. else the API's own English `detail`, when it is a non-empty string;
 * 3. else the caller's fallback, by default `errors.unknown` in the active
 *    language.
 *
 * Pure of axios: it takes the response body, so `blob-error.ts` (which parses
 * a Blob first) and the axios helpers share it, and it is tested on plain
 * objects.
 */

/** The body of an API error answer: `{detail, code[, params]}` (or less, from an old API). */
export type ApiErrorBody = {
  detail?: unknown;
  code?: unknown;
  params?: unknown;
};

function asBody(data: unknown): ApiErrorBody | null {
  return typeof data === "object" && data !== null
    ? (data as ApiErrorBody)
    : null;
}

/** The body's `code` when it is a string, else `null`. */
export function apiErrorCode(data: unknown): string | null {
  const code = asBody(data)?.code;
  return typeof code === "string" && code ? code : null;
}

function paramsOf(body: ApiErrorBody): TranslationValues | undefined {
  const params = body.params;
  if (typeof params !== "object" || params === null) return undefined;
  const values: TranslationValues = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" || typeof value === "number") {
      values[key] = value;
    }
  }
  return values;
}

/**
 * The words for an error body, or `null` when it has neither a known code
 * nor a string `detail` (the caller picks its own fallback).
 */
export function serverErrorMessage(data: unknown): string | null {
  const body = asBody(data);
  if (!body) return null;

  const code = apiErrorCode(body);
  if (code && hasMessage(`errors.${code}`)) {
    const message = translate(`errors.${code}`, paramsOf(body));
    if (message) return message;
  }

  const detail = body.detail;
  return typeof detail === "string" && detail.trim() ? detail : null;
}

/** The generic line, `errors.unknown`, in the active language. */
export function unknownErrorMessage(): string {
  return translate("errors.unknown") ?? "Something went wrong";
}

/** `serverErrorMessage`, else `fallback`, else the generic line. */
export function apiErrorMessage(data: unknown, fallback?: string): string {
  return serverErrorMessage(data) ?? fallback ?? unknownErrorMessage();
}
